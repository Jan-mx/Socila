import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

export const { auth, signIn, signOut, handlers } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const adminUsername = process.env.ADMIN_USERNAME;
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

        if (!adminUsername || !adminPasswordHash) {
          return null;
        }

        if (credentials.username !== adminUsername) {
          return null;
        }

        const isValid = await bcrypt.compare(
          credentials.password as string,
          adminPasswordHash,
        );

        if (!isValid) {
          return null;
        }

        return {
          id: "admin",
          name: adminUsername,
          email: `${adminUsername}@admin.local`,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  // 反向代理后自托管（单机 Compose）必需：信任 proxy 转发的 Host/X-Forwarded-* 头
  trustHost: true,
  pages: {
    signIn: "/admin/login",
  },
});
