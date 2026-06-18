export function getInitialsAvatar(fullName: string): string {
  const cleanName = fullName.toUpperCase().trim();
  const parts = cleanName.split(/\s+/).filter(Boolean);
  let initials = "";

  if (parts.length > 0) {
    initials += parts[0][0];
    if (parts.length > 1) {
      initials += parts[parts.length - 1][0];
    }
  }

  if (!initials) initials = "U";

  const gradients = [
    { start: "#3B82F6", end: "#1D4ED8" },
    { start: "#EC4899", end: "#BE185D" },
    { start: "#F59E0B", end: "#B45309" },
    { start: "#10B981", end: "#047857" },
    { start: "#8B5CF6", end: "#6D28D9" },
    { start: "#06B6D4", end: "#0891B2" },
  ];

  const charCodeSum = initials.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const grad = gradients[charCodeSum % gradients.length];

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <defs>
        <linearGradient id="gradInitials" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${grad.start}" />
          <stop offset="100%" stop-color="${grad.end}" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#gradInitials)" rx="50" />
      <text x="50" y="52" font-family="'Inter', system-ui, sans-serif" font-weight="800" font-size="34" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${initials}</text>
    </svg>
  `
    .trim()
    .replace(/\s+/g, " ");

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
