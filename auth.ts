import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

const accessManagers = new Set(["sourav@clockwork-av.com", "joyjeet@clockwork-av.com"]);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  providers: [Google({ allowDangerousEmailAccountLinking: true })],
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      if (accessManagers.has(email)) {
        await prisma.user.upsert({ where: { email }, update: { active: true, role: "ADMIN", accessManager: true }, create: { email, name: user.name, image: user.image, active: true, role: "ADMIN", accessManager: true } });
        return true;
      }
      const existing = await prisma.user.findUnique({ where: { email } });
      return Boolean(existing?.active);
    },
    async session({ session, user }) {
      const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, active: true, accessManager: true } });
      if (session.user && dbUser) {
        session.user.id = dbUser.id;
        session.user.role = dbUser.role;
        session.user.active = dbUser.active;
        session.user.accessManager = dbUser.accessManager;
      }
      return session;
    }
  }
});
