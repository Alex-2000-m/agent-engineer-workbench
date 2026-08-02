import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default function Icon() {
  const pixel = (left: number, top: number, width: number, height: number, color: string) => (
    <div style={{ position: "absolute", left, top, width, height, background: color }} />
  );
  return new ImageResponse(
    <div style={{ width: "64px", height: "64px", display: "flex", position: "relative", background: "#152019" }}>
      {pixel(8, 8, 16, 16, "#d9ff72")}
      {pixel(40, 8, 16, 16, "#d9ff72")}
      {pixel(8, 16, 48, 40, "#d9ff72")}
      {pixel(16, 28, 8, 8, "#152019")}
      {pixel(40, 28, 8, 8, "#152019")}
      {pixel(28, 38, 8, 6, "#ff8c73")}
      {pixel(24, 48, 16, 4, "#152019")}
      {pixel(48, 12, 8, 8, "#68c4ff")}
    </div>,
    size,
  );
}
