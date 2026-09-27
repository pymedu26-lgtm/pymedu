import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

const FEATURES = [
  { icon: 'point_of_sale', title: 'Ventas y Gastos', desc: 'Registra cada movimiento con 2 clics. Sin columnas ni planillas.' },
  { icon: 'inventory_2', title: 'Inventario simple', desc: 'Controla tu stock con alertas automáticas de reposición.' },
  { icon: 'badge', title: 'Remuneraciones Chile', desc: 'Liquidaciones, AFP, Fonasa, IUSC. Calculado al día.' },
  { icon: 'receipt_long', title: 'Documentos y F29', desc: 'Preparador de IVA y documentos tributarios internos.' },
  { icon: 'groups', title: 'Equipo y accesos', desc: 'Roles, permisos e invitaciones para tu equipo.' },
  { icon: 'auto_awesome', title: 'Asistente IA', desc: 'Pregunta en lenguaje natural y obtén respuestas de tu negocio.' },
];

const BENEFITS = [
  { stat: '10 min', label: 'en entender el panel' },
  { stat: '1 persona', label: 'sin área TI lo opera' },
  { stat: '100% online', label: 'sin instalaciones' },
  { stat: '$0', label: 'para empezar' },
];

const PLANS = [
  {
    name: 'Básico',
    price: 'Free',
    desc: 'Para emprendimientos unipersonales',
    features: ['Dashboard financiero', '5 ventas/mes', 'Gastos ilimitados', 'Asistente IA básico'],
    cta: 'Crear cuenta',
    featured: false,
  },
  {
    name: 'Emprende',
    price: '$9.900',
    period: '/mes',
    desc: 'Para negocios en crecimiento',
    features: ['Todo lo de Básico', 'Ventas ilimitadas', 'Inventario básico', 'Reportes mensuales', 'Soporte prioritario'],
    cta: 'Elegir Emprende',
    featured: false,
  },
  {
    name: 'Pro Gestión',
    price: '$19.900',
    period: '/mes',
    desc: 'Para pymes con equipo',
    features: ['Todo lo de Emprende', 'Remuneraciones', 'Documentos laborales', 'Firma electrónica', 'Mercado Público', 'Portal Municipal'],
    cta: 'Elegir Pro',
    featured: true,
  },
  {
    name: 'Empresa',
    price: 'A medida',
    period: '',
    desc: 'Para organizaciones e instituciones',
    features: ['Todo lo de Pro Gestión', 'Plantillas corporativas', 'API y webhooks', 'Soporte dedicado', 'Onboarding asistido'],
    cta: 'Contactar',
    featured: false,
  },
];

const FAQS = [
  { q: '¿Necesito ser contador para usar PymEdu?', a: 'No. PymEdu está diseñado para dueños de negocio sin formación contable. Todo está explicado en lenguaje cotidiano.' },
  { q: '¿Puedo probarlo antes de pagar?', a: 'Sí. Crea una cuenta gratis y usa el demo premium sin costo por tiempo ilimitado.' },
  { q: '¿Funciona para mi tipo de negocio?', a: 'PymEdu funciona para cualquier mype: retail, servicios, gastronomía, manufactura, profesionales independientes.' },
  { q: '¿Mis datos están seguros?', a: 'Sí. Usamos Supabase (PostgreSQL) con encriptación en reposo y tránsito, RLS por empresa, y autenticación segura.' },
];

export default function Landing() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex flex-col min-h-screen bg-surface-container-lowest">
      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-50 bg-surface-container-lowest/80 backdrop-blur-xl border-b border-outline-variant/20">
        <div className="flex items-center justify-between px-6 md:px-10 py-4 max-w-7xl mx-auto w-full">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl command-gradient flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
              <span className="material-symbols-outlined text-white text-lg">business_center</span>
            </div>
            <span className="text-lg font-extrabold text-primary tracking-tight">PymEdu</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-semibold text-on-surface-variant hover:text-primary transition-colors">Funcionalidades</a>
            <a href="#plans" className="text-sm font-semibold text-on-surface-variant hover:text-primary transition-colors">Planes</a>
            <Link to="/login" className="text-sm font-bold text-primary hover:text-primary/80 transition-colors">Iniciar sesión</Link>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-surface-container transition-colors"
              title={theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
            >
              <span className="material-symbols-outlined text-on-surface-variant">
                {theme === 'light' ? 'dark_mode' : 'light_mode'}
              </span>
            </button>
            <Link to="/register" className="px-5 py-2 bg-primary text-inverse-on-surface rounded-full text-sm font-bold shadow-lg shadow-primary/20 hover:shadow-xl hover:scale-105 transition-all">
              Comenzar gratis
            </Link>
          </nav>
          <Link to="/register" className="md:hidden px-4 py-2 bg-primary text-inverse-on-surface rounded-full text-xs font-bold">
            Gratis
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 command-gradient opacity-5" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#1B3022 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-28 md:pt-28 md:pb-36 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary-container/60 text-on-secondary-container mb-8 border border-secondary-container">
            <span className="material-symbols-outlined text-sm">auto_awesome</span>
            <span className="text-xs font-bold uppercase tracking-[0.15em]">El ERP para emprendedores chilenos</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-primary tracking-tight mb-6 leading-[1.1]">
            Ordena, controla y haz crecer tu negocio
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary-container block mt-2">sin fricción</span>
          </h1>

          <p className="text-lg md:text-xl text-on-surface-variant mb-10 max-w-2xl mx-auto leading-relaxed">
            PymEdu es la plataforma diseñada para micro y pequeñas empresas que necesitan entender sus finanzas de forma simple, rápida y sin lenguaje técnico.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/register" className="group w-full sm:w-auto px-8 py-4 command-gradient text-white rounded-full text-base font-bold shadow-xl shadow-primary/25 hover:shadow-2xl hover:scale-105 transition-all inline-flex items-center justify-center gap-2">
              Crear cuenta gratis
              <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </Link>
            <Link to="/login" className="w-full sm:w-auto px-8 py-4 bg-surface-container-lowest text-primary rounded-full text-base font-bold border-2 border-primary/10 hover:border-primary/30 hover:bg-primary/5 transition-all inline-flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-lg">play_arrow</span>
              Demo interactivo
            </Link>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-8 md:gap-12 text-sm text-on-surface-variant">
            {BENEFITS.map((b) => (
              <div key={b.label} className="flex items-center gap-2">
                <span className="text-lg font-extrabold text-primary">{b.stat}</span>
                <span className="hidden sm:inline text-on-surface-variant/70">—</span>
                <span className="text-on-surface-variant/80">{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Dashboard Preview ── */}
      <section className="max-w-6xl mx-auto px-6 pb-20 w-full -mt-10 relative z-10">
        <div className="rounded-2xl overflow-hidden shadow-2xl border border-outline-variant/10 bg-surface-container-lowest">
          <div className="bg-gradient-to-br from-[#0a0f2c] to-[#141b4d] h-[320px] md:h-[480px] flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between px-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-error" />
                <div className="w-2 h-2 rounded-full bg-warning" />
                <div className="w-2 h-2 rounded-full bg-success" />
              </div>
              <span className="text-white/30 text-xs font-mono">pymedu.cl/dashboard</span>
            </div>
            <div className="z-10 text-center px-6">
              <div className="grid grid-cols-3 gap-3 md:gap-4 max-w-lg mx-auto mb-6">
                {[
                  { label: 'Ventas hoy', value: '$340.000', up: true },
                  { label: 'Gastos hoy', value: '$89.500', up: false },
                  { label: 'Utilidad', value: '$250.500', up: true },
                ].map((k) => (
                  <div key={k.label} className="bg-white/10 backdrop-blur rounded-xl p-3 md:p-4 text-left">
                    <p className="text-white/50 text-[10px] md:text-xs font-semibold uppercase tracking-wider">{k.label}</p>
                    <p className="text-white text-sm md:text-lg font-extrabold mt-1">{k.value}</p>
                    <p className={`text-[10px] md:text-xs font-bold flex items-center gap-0.5 mt-0.5 ${k.up ? 'text-success' : 'text-error'}`}>
                      <span className="material-symbols-outlined text-xs">{k.up ? 'trending_up' : 'trending_down'}</span>
                      {k.up ? '+12%' : '-3%'}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-white/60 text-xs md:text-sm font-medium">Dashboard en tiempo real — sin configurar nada</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-20 md:py-28 bg-surface">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary bg-primary/5 px-4 py-1.5 rounded-full">Funcionalidades</span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-on-surface mt-6 mb-4">Todo lo que necesitas para gestionar tu negocio</h2>
            <p className="text-on-surface-variant max-w-xl mx-auto">Sin módulos enterprise que nunca usarás. Solo lo que realmente necesita una mype chilena.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="group bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/10 hover:border-primary/20 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className="w-11 h-11 rounded-xl command-gradient flex items-center justify-center mb-4 shadow-md shadow-primary/10 group-hover:shadow-lg group-hover:scale-110 transition-all">
                  <span className="material-symbols-outlined text-white text-xl">{f.icon}</span>
                </div>
                <h3 className="text-lg font-extrabold text-on-surface mb-2">{f.title}</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Plans ── */}
      <section id="plans" className="py-20 md:py-28 bg-surface-container-lowest">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary bg-primary/5 px-4 py-1.5 rounded-full">Planes</span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-on-surface mt-6 mb-4">Un plan para cada etapa de tu negocio</h2>
            <p className="text-on-surface-variant max-w-xl mx-auto">Empieza gratis. Escala cuando lo necesites. Sin cláusulas de permanencia.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-6 border-2 transition-all duration-300 flex flex-col ${
                  plan.featured
                    ? 'border-primary bg-primary/[0.03] shadow-xl shadow-primary/10 scale-[1.02]'
                    : 'border-outline-variant/20 bg-surface-container-lowest hover:border-primary/30 hover:shadow-lg'
                }`}
              >
                {plan.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-inverse-on-surface text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                    Recomendado
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-lg font-extrabold text-on-surface">{plan.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-primary">{plan.price}</span>
                    {plan.period && <span className="text-sm text-on-surface-variant">{plan.period}</span>}
                  </div>
                  <p className="text-sm text-on-surface-variant mt-2">{plan.desc}</p>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <span className="material-symbols-outlined text-primary text-base mt-0.5">check_circle</span>
                      <span className="text-on-surface-variant">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/register"
                  className={`w-full py-3 rounded-xl text-sm font-bold text-center transition-all ${
                    plan.featured
                      ? 'command-gradient text-white shadow-lg shadow-primary/20 hover:shadow-xl hover:scale-[1.02]'
                      : 'bg-surface text-on-surface border border-outline-variant/20 hover:bg-surface-container-high'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-20 md:py-28 bg-surface">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary bg-primary/5 px-4 py-1.5 rounded-full">FAQ</span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-on-surface mt-6">Preguntas frecuentes</h2>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left transition-colors hover:bg-surface"
                >
                  <span className="font-bold text-on-surface text-sm md:text-base pr-4">{faq.q}</span>
                  <span className={`material-symbols-outlined text-on-surface-variant transition-transform duration-300 ${openFaq === i ? 'rotate-180' : ''}`}>
                    expand_more
                  </span>
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openFaq === i ? 'max-h-40 pb-5 px-5' : 'max-h-0'}`}>
                  <p className="text-sm text-on-surface-variant leading-relaxed">{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-20 md:py-28 bg-surface-container-lowest relative overflow-hidden">
        <div className="absolute inset-0 command-gradient opacity-[0.03]" />
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-primary mb-6">Empieza hoy. Sin tarjeta de crédito.</h2>
          <p className="text-lg text-on-surface-variant mb-10 max-w-lg mx-auto">
            Crea tu cuenta en 30 segundos y accede al demo completo con datos de prueba. Si te gusta, conecta tu negocio real.
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-8 py-4 command-gradient text-white rounded-full text-base font-bold shadow-xl shadow-primary/25 hover:shadow-2xl hover:scale-105 transition-all"
          >
            Crear cuenta gratis
            <span className="material-symbols-outlined text-lg">arrow_forward</span>
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-outline-variant/10 bg-surface-container-lowest">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg command-gradient flex items-center justify-center">
                <span className="material-symbols-outlined text-white text-sm">business_center</span>
              </div>
              <span className="text-base font-extrabold text-primary tracking-tight">PymEdu</span>
            </div>
            <nav className="flex items-center gap-6 text-sm text-on-surface-variant">
              <a href="#features" className="hover:text-primary transition-colors">Funcionalidades</a>
              <a href="#plans" className="hover:text-primary transition-colors">Planes</a>
              <Link to="/login" className="hover:text-primary transition-colors">Iniciar sesión</Link>
              <Link to="/register" className="hover:text-primary transition-colors">Registro</Link>
            </nav>
            <p className="text-xs text-on-surface-variant/60">© 2026 PymEdu Platform. Hecho en Chile 🇨🇱</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
