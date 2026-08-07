import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { effectiveAccess, isClockworkEmail, isSystemAccessManager, normalizeEmail } from "@/lib/access-policy";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  pages: { signIn: "/signin" },
  providers: [Google({ allowDangerousEmailAccountLinking: true })],
  callbacks: {
    async signIn({ user, profile }) {
      const email = normalizeEmail(user.email);
      const googleProfile = profile as { email?: string; email_verified?: boolean } | undefined;
      if (!email || googleProfile?.email_verified !== true || !isClockworkEmail(email)) return "/signin?error=domain";
      const existing = await prisma.user.findUnique({ where: { email } });
      const data = isSystemAccessManager(email)
        ? { active: true, role: "ADMIN" as const, accessManager: true, name: user.name ?? undefined, image: user.image ?? undefined }
        : existing
          ? { name: user.name ?? undefined, image: user.image ?? undefined }
          : { active: true, role: "QUOTE_USER" as const, accessManager: false, name: user.name ?? undefined, image: user.image ?? undefined };
      const provisioned = await prisma.user.upsert({ where: { email }, update: data, create: { email, ...data } });
      if (!isSystemAccessManager(email) && !provisioned.active) return "/signin?error=disabled";
      return true;
    },
    async session({ session, user }) {
      const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, email: true, role: true, active: true, accessManager: true } });
      if (session.user && dbUser) {
        const effective = effectiveAccess(dbUser);
        if (effective !== dbUser) await prisma.user.update({ where: { id: dbUser.id }, data: { role: "ADMIN", active: true, accessManager: true } });
        session.user.id = effective.id;
        session.user.role = effective.role;
        session.user.active = effective.active;
        session.user.accessManager = effective.accessManager;
      }
      return session;
    }
  }
});
