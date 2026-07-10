export const formatDate = (dateString: string | undefined | null): string => {
  if (!dateString) return "—";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleString("es-MX", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  } catch (e) {
    return dateString;
  }
};

export const compactId = (id: string | undefined | null): string => {
  if (!id) return "—";
  if (id.length <= 10) return id;
  return `${id.substring(0, 6)}...${id.substring(id.length - 4)}`;
};
