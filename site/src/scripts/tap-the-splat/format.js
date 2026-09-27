// m:ss.cc, from whole hundredths so it never shows 0:60.00.
export const fmtTime = (secs) => {
  const cs = Math.floor(Math.max(0, secs) * 100), m = Math.floor(cs / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
  return `${m}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
};
