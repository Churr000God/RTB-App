import { LoginForm } from '@/components/auth/login-form';
import Image from 'next/image';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rtb-surface via-white to-rtb-surface relative overflow-hidden">
      {/* Decorative wave */}
      <div className="absolute bottom-0 left-0 right-0 h-32 opacity-10">
        <svg viewBox="0 0 1440 120" className="w-full h-full" preserveAspectRatio="none">
          <path
            d="M0,60 C360,120 720,0 1080,60 C1260,90 1380,30 1440,60 L1440,120 L0,120 Z"
            fill="#159895"
          />
        </svg>
      </div>
      {/* Decorative gold line */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-rtb-gold to-transparent" />

      <div className="w-full max-w-md mx-4 z-10">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="relative w-36 h-36">
            <Image
              src="/logo-rtb.png"
              alt="Refacciones Tomás Badillo"
              fill
              className="object-contain"
              priority
            />
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl p-8" style={{ boxShadow: 'var(--shadow-lg)' }}>
          <div className="text-center mb-6">
            <h1 className="font-display text-2xl font-bold text-rtb-navy tracking-tight">
              Sistema RTB
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Ingresa tus credenciales para acceder al sistema
            </p>
          </div>
          <LoginForm />
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Refacciones Tomás Badillo, S.A. de C.V.
        </p>
      </div>
    </div>
  );
}
