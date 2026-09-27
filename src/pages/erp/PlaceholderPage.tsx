﻿import { Link } from "react-router-dom";

interface PlaceholderPageProps {
  title: string;
  icon: string;
  description?: string;
}

export default function PlaceholderPage({ title, icon, description }: PlaceholderPageProps) {
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto min-h-screen flex items-center justify-center">
      <div className="bg-surface-container-lowest dark-card rounded-3xl shadow-sm p-12 text-center max-w-md w-full">
        <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <span className="material-symbols-outlined text-4xl text-primary">{icon}</span>
        </div>
        <h2 className="text-2xl font-extrabold text-on-surface mb-3">{title}</h2>
        <p className="text-on-surface-variant mb-8 font-medium">
          {description || "Este modulo esta en desarrollo. Pronto estara disponible."}
        </p>
        <Link
          to="/erp/inicio"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-inverse-on-surface rounded-xl font-bold shadow-lg glow-primary hover:scale-105 transition-all"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          Volver al Panel
        </Link>
      </div>
    </div>
  );
}
