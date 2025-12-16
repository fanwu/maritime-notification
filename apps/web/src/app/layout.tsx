import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Maritime Notification System',
  description: 'Real-time vessel tracking and notification system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-100 min-h-screen">{children}</body>
    </html>
  );
}
