// Cover pictures for the Vault (docs/specs/game-vault.md §6): a drop area, then a 3:4 crop in the
// browser (drag to move, the slider zooms; no library: a canvas), then a signed upload straight
// to Cloudinary. The rules are checked here so members get a plain message right away; the
// server checks the uploaded file again (format, bytes, size, portrait) and trusts nothing.
//
//   coverPicker(container, { onReady(blob|null) })   the drop area + crop UI inside a dialog
//   uploadSigned({ uploadUrl, fields }, blob) -> Cloudinary's reply ({ public_id, … })

export const COVER_RULES = { types: ["image/jpeg", "image/png", "image/webp"], maxBytes: 5 * 1024 * 1024, minW: 300, minH: 400 };
export const RULES_TEXT = "JPG, PNG or WebP, up to 5 MB, at least 300 × 400 pixels. You'll crop it to a 3:4 cover next.";
const OUT_W = 600, OUT_H = 800;   // what we upload (never below the 300 × 400 minimum)

export function ruleProblem(file: File): string | null {
  if (!COVER_RULES.types.includes(file.type)) return "That file type won't work. Use a JPG, PNG or WebP.";
  if (file.size > COVER_RULES.maxBytes) return "That file is over 5 MB. Try a smaller one.";
  return null;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("unreadable")); };
    img.src = url;
  });
}

/** The drop area, then the crop. onReady gets the cropped JPEG (or null when the member starts over). */
export function coverPicker(box: HTMLElement, { onReady }: { onReady: (blob: Blob | null) => void }) {
  const showDrop = (msg = "") => {
    onReady(null);
    box.innerHTML = `<label class="bt-dropzone" tabindex="0" data-drop><input type="file" accept="image/jpeg,image/png,image/webp" hidden data-file><span>Drop a picture here</span><span><b>or choose a file</b></span><span class="bt-hint">${RULES_TEXT}</span></label>${msg ? `<p class="bt-notice bt-notice--error" role="alert">${msg}</p>` : ""}`;
    const drop = box.querySelector<HTMLElement>("[data-drop]")!, input = box.querySelector<HTMLInputElement>("[data-file]")!;
    drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("is-over"); const f = e.dataTransfer?.files?.[0]; if (f) take(f); });
    input.addEventListener("change", () => { const f = input.files?.[0]; if (f) take(f); });
  };
  const take = async (file: File) => {
    const bad = ruleProblem(file);
    if (bad) return showDrop(bad);
    let img: HTMLImageElement;
    try { img = await loadImage(file); } catch { return showDrop("We couldn't read that picture. Try another file."); }
    if (img.naturalWidth < COVER_RULES.minW || img.naturalHeight < COVER_RULES.minH) return showDrop(`That picture is ${img.naturalWidth} × ${img.naturalHeight}. Covers need at least 300 × 400 pixels.`);
    crop(img);
  };
  const crop = (img: HTMLImageElement) => {
    box.innerHTML = `<div class="gv-crop"><div class="gv-crop-frame" data-frame aria-label="Drag to move the picture"><canvas width="${OUT_W}" height="${OUT_H}"></canvas></div><div class="gv-crop-side"><span class="bt-label">Crop to 3:4</span><span class="bt-hint">Drag the picture to place it. Zoom in to pick the part you want.</span><label class="bt-field"><span class="bt-label">Zoom</span><input type="range" min="1" max="1" step="0.01" value="1" data-zoom aria-label="Zoom"></label><button type="button" class="bt-link-btn" data-again>Use a different picture</button></div></div>`;
    const canvas = box.querySelector("canvas")!, ctx = canvas.getContext("2d")!, zoom = box.querySelector<HTMLInputElement>("[data-zoom]")!;
    const W = img.naturalWidth, H = img.naturalHeight;
    // The crop is a 3:4 window in the picture. At zoom 1 it is as big as fits; zooming shrinks it,
    // but never below 300 × 400 source pixels (the server's minimum).
    const base = Math.min(W / 3, H / 4) * 1;                 // window = 3*base by 4*base
    const maxZoom = Math.max(1, Math.min((3 * base) / COVER_RULES.minW, (4 * base) / COVER_RULES.minH));
    zoom.max = String(maxZoom.toFixed(2));
    let z = 1, cx = W / 2, cy = H / 2;
    const win = () => ({ w: (3 * base) / z, h: (4 * base) / z });
    const clamp = () => { const { w, h } = win(); cx = Math.min(Math.max(cx, w / 2), W - w / 2); cy = Math.min(Math.max(cy, h / 2), H - h / 2); };
    const draw = () => {
      clamp();
      const { w, h } = win();
      ctx.clearRect(0, 0, OUT_W, OUT_H);
      ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h, 0, 0, OUT_W, OUT_H);
    };
    const emit = () => canvas.toBlob((b) => onReady(b), "image/jpeg", 0.9);
    zoom.addEventListener("input", () => { z = Number(zoom.value); draw(); });
    zoom.addEventListener("change", emit);
    const frame = box.querySelector<HTMLElement>("[data-frame]")!;
    let drag: { x: number; y: number } | null = null;
    frame.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; frame.setPointerCapture(e.pointerId); });
    frame.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const { w } = win(), scale = w / frame.clientWidth;
      cx -= (e.clientX - drag.x) * scale; cy -= (e.clientY - drag.y) * scale;
      drag = { x: e.clientX, y: e.clientY };
      draw();
    });
    frame.addEventListener("pointerup", () => { if (drag) { drag = null; emit(); } });
    box.querySelector("[data-again]")!.addEventListener("click", () => showDrop());
    draw();
    emit();
  };
  showDrop();
}

/** A signed upload straight to Cloudinary (the signature came from one of our callables). */
export async function uploadSigned({ uploadUrl, fields }: { uploadUrl: string; fields: Record<string, string | number> }, blob: Blob) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => fd.append(k, String(v)));
  fd.append("file", blob, "cover.jpg");
  const res = await fetch(uploadUrl, { method: "POST", body: fd });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.public_id) throw Object.assign(new Error(json?.error?.message || "The upload didn't go through."), { code: "bt/upload" });
  return json as { public_id: string; secure_url: string; width: number; height: number; bytes: number; format: string };
}
