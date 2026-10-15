import { VIEW } from "./config.js";
import { PLAYER_VIEW } from "./player-visibility.js";

export function playerEdgeMarker(point, width, height) {
  if (point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height) return null;
  const center = { x: width / 2, y: height / 2 };
  const dx = point.x - center.x, dy = point.y - center.y;
  const halfW = Math.max(30, width / 2 - 65), halfH = Math.max(25, height / 2 - 85);
  const factor = Math.min(halfW / Math.max(.001, Math.abs(dx)), halfH / Math.max(.001, Math.abs(dy)));
  return { x: center.x + dx * factor, y: center.y + dy * factor, angle: Math.atan2(dy, dx) };
}

export function drawCameraOverlay(renderer, game) {
  if (!game.playerVisibility) return;
  const { ctx, width, height } = renderer;
  const center = renderer.iso(game.player.x, game.player.y);
  // One inexpensive screen overlay; no sight rays, blur or extra full-size canvas.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.ellipse(center.x, center.y, PLAYER_VIEW.radius * VIEW.tileW / Math.SQRT2*(renderer.zoom||1),
    PLAYER_VIEW.radius * VIEW.tileH / Math.SQRT2*(renderer.zoom||1), 0, 0, Math.PI * 2, true);
  ctx.fillStyle = "rgba(3,9,7,.67)";
  ctx.fill("evenodd");
  ctx.restore();
  if (renderer.cameraFollowing) return;
  const marker = playerEdgeMarker(center, width, height);
  if (!marker) return;
  ctx.save();
  ctx.translate(marker.x, marker.y);
  ctx.fillStyle = "rgba(13,21,17,.95)";
  ctx.strokeStyle = "#d3bb82";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.rotate(marker.angle);
  ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-4, -6); ctx.lineTo(-1, 0); ctx.lineTo(-4, 6); ctx.closePath();
  ctx.fillStyle = "#e2d3ae"; ctx.fill();
  ctx.restore();
}
