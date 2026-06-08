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
      <rect x="5" y="5" width="30" height="30" rx="9" fill="#111827" />
      <path
        d="M11.5 20C14.2 15.7 17.4 13.6 20 13.6C22.6 13.6 25.8 15.7 28.5 20C25.8 24.3 22.6 26.4 20 26.4C17.4 26.4 14.2 24.3 11.5 20Z"
        stroke="#F8FAFC"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24.7 24.7L31.5 31.5"
        stroke="#22D3EE"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
      <circle cx="20" cy="20" r="4.6" fill="#F8FAFC" />
      <circle cx="20" cy="20" r="2.2" fill="#2563EB" />
      <path
        d="M14.2 11.6L17 11.6M11.6 14.2L11.6 17M28.4 14.2L28.4 17"
        stroke="#A7F3D0"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
