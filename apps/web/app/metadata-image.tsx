import { ImageResponse } from "next/og";

type MetadataImageOptions = {
  width: number;
  height: number;
  title: string;
  subtitle: string;
  compact?: boolean;
};

const palette = {
  slate900: "#111827",
  slate800: "#1f2937",
  slate700: "#334155",
  slate500: "#64748b",
  sky400: "#38bdf8",
  sky300: "#7dd3fc",
  teal400: "#2dd4bf",
  orange500: "#f97316",
  orange400: "#fb923c",
  orange300: "#fdba74",
  stone50: "#f8fafc",
  white: "#ffffff",
};

const BrandMark = ({ size }: { size: number }) => {
  const stroke = Math.max(2, Math.round(size * 0.06));
  const inner = size * 0.56;
  const half = inner / 2;
  const center = size / 2;
  const top = center - inner * 0.28;
  const bottom = center + inner * 0.18;
  const left = center - half;
  const right = center + half;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        background: `linear-gradient(160deg, ${palette.orange400} 0%, ${palette.orange500} 52%, #ea580c 100%)`,
        boxShadow: "0 16px 42px rgba(249, 115, 22, 0.28)",
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
        <path
          d={`M ${center} ${top - inner * 0.22} L ${right} ${top} L ${center} ${top + inner * 0.24} L ${left} ${top} Z`}
          stroke={palette.slate900}
          strokeWidth={stroke}
          strokeLinejoin="round"
        />
        <path
          d={`M ${left} ${top} L ${left} ${bottom} L ${center} ${bottom + inner * 0.26} L ${center} ${top + inner * 0.24}`}
          stroke={palette.slate900}
          strokeWidth={stroke}
          strokeLinejoin="round"
        />
        <path
          d={`M ${right} ${top} L ${right} ${bottom} L ${center} ${bottom + inner * 0.26} L ${center} ${top + inner * 0.24}`}
          stroke={palette.slate900}
          strokeWidth={stroke}
          strokeLinejoin="round"
        />
        <path
          d={`M ${center} ${top + inner * 0.24} L ${center} ${bottom + inner * 0.26}`}
          stroke={palette.slate900}
          strokeWidth={stroke}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

const GraphNode = ({ label, accent }: { label: string; accent: string }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      gap: 10,
      width: 164,
      minHeight: 92,
      borderRadius: 24,
      padding: "18px 20px",
      background: "rgba(17, 24, 39, 0.72)",
      border: "1px solid rgba(125, 211, 252, 0.16)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: 999,
          background: accent,
          boxShadow: `0 0 18px ${accent}`,
        }}
      />
      <div
        style={{
          fontSize: 20,
          color: palette.white,
          fontWeight: 700,
          letterSpacing: "-0.03em",
        }}
      >
        {label}
      </div>
    </div>
    <div
      style={{
        fontSize: 15,
        color: "rgba(248, 250, 252, 0.72)",
      }}
    >
      Running
    </div>
  </div>
);

const Canvas = ({ width, height, title, subtitle, compact = false }: MetadataImageOptions) => (
  <div
    style={{
      display: "flex",
      width: "100%",
      height: "100%",
      position: "relative",
      overflow: "hidden",
      background: `linear-gradient(135deg, ${palette.slate900} 0%, #0f172a 48%, ${palette.slate800} 100%)`,
      color: palette.white,
      fontFamily: '"Avenir Next", "Segoe UI", sans-serif',
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(circle at 20% 18%, rgba(249, 115, 22, 0.28), transparent 28%), radial-gradient(circle at 84% 18%, rgba(45, 212, 191, 0.20), transparent 26%), radial-gradient(circle at 74% 72%, rgba(56, 189, 248, 0.16), transparent 24%)",
      }}
    />

    <div
      style={{
        position: "absolute",
        top: -height * 0.18,
        right: -width * 0.07,
        width: width * 0.5,
        height: width * 0.5,
        borderRadius: 9999,
        border: "1px solid rgba(248,250,252,0.06)",
        transform: "rotate(-12deg)",
      }}
    />

    <div
      style={{
        position: "absolute",
        bottom: -height * 0.34,
        left: -width * 0.08,
        width: width * 0.46,
        height: width * 0.46,
        borderRadius: 9999,
        border: "1px solid rgba(248,250,252,0.05)",
      }}
    />

    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "stretch",
        width: "100%",
        height: "100%",
        padding: compact ? "72px" : "72px 76px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: compact ? "58%" : "60%",
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: compact ? 64 : 72,
              height: compact ? 64 : 72,
            }}
          >
            <BrandMark size={compact ? 64 : 72} />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: compact ? 20 : 22,
                color: "rgba(248, 250, 252, 0.72)",
                textTransform: "uppercase",
                letterSpacing: "0.22em",
                fontWeight: 700,
              }}
            >
              Local Docker Control Center
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: compact ? 16 : 18,
                color: palette.orange300,
                fontWeight: 600,
              }}
            >
              <span>Groups</span>
              <span style={{ color: palette.slate500 }}>•</span>
              <span>Dependencies</span>
              <span style={{ color: palette.slate500 }}>•</span>
              <span>Inspect</span>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: compact ? 20 : 24,
            maxWidth: compact ? 560 : 650,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: compact ? 72 : 82,
              lineHeight: 1,
              letterSpacing: "-0.07em",
              fontWeight: 800,
            }}
          >
            {title}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: compact ? 28 : 32,
              lineHeight: 1.25,
              color: "rgba(248, 250, 252, 0.82)",
              maxWidth: compact ? 560 : 620,
            }}
          >
            {subtitle}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center",
            fontSize: compact ? 18 : 20,
            color: palette.stone50,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: compact ? "12px 18px" : "14px 20px",
              borderRadius: 999,
              background: "rgba(17, 24, 39, 0.56)",
              border: "1px solid rgba(125, 211, 252, 0.14)",
            }}
          >
            <span style={{ color: palette.teal400 }}>●</span>
            Runtime-aware group orchestration
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: compact ? "34%" : "32%",
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 26,
            padding: compact ? "28px 24px" : "32px 26px",
            borderRadius: 32,
            background: "linear-gradient(180deg, rgba(30, 41, 59, 0.86) 0%, rgba(15, 23, 42, 0.94) 100%)",
            border: "1px solid rgba(148, 163, 184, 0.16)",
            boxShadow: "0 30px 80px rgba(15, 23, 42, 0.45)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: 340,
            }}
          >
            <GraphNode label="db" accent={palette.teal400} />
            <div
              style={{
                width: 46,
                height: 4,
                borderRadius: 999,
                background: `linear-gradient(90deg, ${palette.teal400} 0%, ${palette.sky400} 100%)`,
              }}
            />
            <GraphNode label="api" accent={palette.sky400} />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 4,
                height: 30,
                borderRadius: 999,
                background: `linear-gradient(180deg, ${palette.sky400} 0%, ${palette.orange400} 100%)`,
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
            }}
          >
            <GraphNode label="web" accent={palette.orange400} />
          </div>
        </div>
      </div>
    </div>
  </div>
);

export const createMetadataImage = (options: MetadataImageOptions) =>
  new ImageResponse(<Canvas {...options} />, {
    width: options.width,
    height: options.height,
  });
