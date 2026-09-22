interface Segment {
  name: string;
  value: number;
  color: string;
}

/**
 * 纯 SVG 环形图。
 * 首页的占比图不需要引入图表库 —— 一个 donut 就是几段 stroke-dasharray，
 * 省掉的 ~200kB 直接影响首屏速度。
 */
export function Donut({
  segments,
  size = 172,
  thickness = 28,
  children,
}: {
  segments: Segment[];
  size?: number;
  thickness?: number;
  children?: React.ReactNode;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const center = size / 2;

  let offset = 0;

  return (
    <div className="ring-canvas" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="支出构成占比">
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="var(--bg-surface-2)"
          strokeWidth={thickness}
        />
        {total > 0
          ? segments.map((s) => {
              const raw = (s.value / total) * c;
              // 段与段之间留一点缝隙，视觉上更容易分辨
              const len = Math.max(0, raw - (segments.length > 1 ? 2 : 0));
              const dash = `${len} ${c - len}`;
              const el = (
                <circle
                  key={s.name}
                  cx={center}
                  cy={center}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={thickness}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  transform={`rotate(-90 ${center} ${center})`}
                  strokeLinecap="butt"
                />
              );
              offset += raw;
              return el;
            })
          : null}
      </svg>
      {children ? <div className="ring-center">{children}</div> : null}
    </div>
  );
}
