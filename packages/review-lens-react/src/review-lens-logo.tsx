type ReviewLensLogoProps = {
  className?: string;
  title?: string;
};

export function ReviewLensLogo({ className, title = "Review Lens logo" }: ReviewLensLogoProps) {
  return (
    <svg
      className={className}
      role="img"
      aria-label={title}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="4" y="6" width="28" height="28" rx="8" fill="#171717" />
      <path
        d="M13 15.5C14.5 13.4 17.1 12 20 12C23.9 12 27.3 14.5 28.7 18C27.3 21.5 23.9 24 20 24C17.1 24 14.5 22.6 13 20.5"
        stroke="#FFFFFF"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="18" r="3.4" fill="#F97316" />
      <path
        d="M28.5 26.5L34.5 32.5"
        stroke="#2563EB"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="31.8" cy="29.8" r="2.1" fill="#FACC15" stroke="#171717" strokeWidth="1.4" />
    </svg>
  );
}
