export const CLIENT_RATE_MULTIPLIER = 1.4;
export const clientRateFromVendor = (vendorRatePaise: number) => Math.round(vendorRatePaise * CLIENT_RATE_MULTIPLIER);
export const vendorRateFromClient = (clientRatePaise: number) => Math.round(clientRatePaise / CLIENT_RATE_MULTIPLIER);
