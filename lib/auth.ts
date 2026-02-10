import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

const JUDGE_USERNAME = process.env.JUDGE_USERNAME;
const JUDGE_PASSWORD = process.env.JUDGE_PASSWORD;

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (
          JUDGE_USERNAME &&
          JUDGE_PASSWORD &&
          credentials?.username === JUDGE_USERNAME &&
          credentials?.password === JUDGE_PASSWORD
        ) {
          return { id: 'judge', name: 'Hackathon Judge', email: 'judge@revision.app' };
        }
        return null;
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/auth/signin',
  },
  secret: process.env.NEXTAUTH_SECRET || 'your-secret-key-change-in-production',
};
