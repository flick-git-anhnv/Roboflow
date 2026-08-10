interface LogoProps {
  size?: number;
  className?: string;
}

// Placeholder mark using KZTEK brand colors. Replace with the official
// Kztek_Logo.jpg asset (place it in client/public/kztek-logo.png and swap
// the markup below for an <img> tag) once the file is available locally.
export default function Logo({ size = 28, className }: LogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#251C53" />
      <rect x="7" y="7" width="12" height="12" rx="2" fill="none" stroke="#F05922" strokeWidth="2.2" />
      <circle cx="23" cy="23" r="4" fill="#F05922" />
    </svg>
  );
}
