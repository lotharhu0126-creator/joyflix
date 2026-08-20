import React from 'react';

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 flex h-screen w-screen items-center justify-center overflow-hidden bg-black bg-cover bg-center bg-fixed px-4 animate-fadeIn overscroll-y-contain"
      style={{ backgroundImage: 'url(/loginimg.jpg)' }}
    >
      <div className="absolute inset-0 bg-black opacity-50" />
      {children}
    </div>
  );
}
