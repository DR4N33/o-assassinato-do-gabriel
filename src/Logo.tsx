// Logotipo "O Assassinato do Gabriel": emblema (impressão digital atravessada por um punhal) + letreiro.

export function Emblem({ size = 120, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={`emblem ${className}`} width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="56" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="60" cy="60" r="50" stroke="currentColor" strokeWidth="1" opacity=".45" />
      {/* impressão digital */}
      <g stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" opacity=".9">
        <path d="M37 64c0-14 10.3-24 23-24s23 10 23 24" />
        <path d="M43 70v-6c0-10 7.6-17 17-17s17 7 17 17v4" />
        <path d="M49 79V64c0-6.2 4.9-11 11-11s11 4.8 11 11v8" />
        <path d="M55 86V64c0-2.8 2.2-5 5-5s5 2.2 5 5v14" />
        <path d="M60 68v22" />
        <path d="M71 80v6M77 74v4M37 72v4" />
        <path d="M44 38c4.6-3.4 10.2-5 16-5s11.4 1.6 16 5" />
      </g>
      {/* punhal */}
      <g className="emblem-blade">
        <path d="M89 20l7 7-39.5 39.5-9 3 3-9z" fill="currentColor" />
        <path d="M45.5 65.5l9 9" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <path d="M47.5 72.5L35 85" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
        <circle cx="33" cy="87" r="3.4" fill="currentColor" />
      </g>
      {/* gota de sangue */}
      <path className="emblem-drop" d="M84 82c0 3.3-2.2 5.5-5 5.5s-5-2.2-5-5.5c0-3.6 5-9.5 5-9.5s5 5.9 5 9.5z" />
    </svg>
  );
}

// Texto do logotipo numa linha: O ASSASSINATO do Gabriel.
export function LogoText() {
  return (
    <span className="logo-text">
      <span className="logo-top">O ASSASSINATO</span>
      <span className="logo-mid">do</span>
      <span className="logo-name">Gabriel<b className="logo-dot" /></span>
    </span>
  );
}

// Letreiro completo para o ecrã de entrada
export function Logo() {
  return (
    <div className="logo" role="img" aria-label="O Assassinato do Gabriel">
      <Emblem className="logo-emblem" />
      <LogoText />
    </div>
  );
}
