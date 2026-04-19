import * as React from 'react';

interface SparklineProps extends Omit<React.SVGProps<SVGSVGElement>, 'values'> {
  values: number[];
  width?: number;
  height?: number;
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
}

export function Sparkline({
  values,
  width = 120,
  height = 32,
  strokeColor = 'var(--brand)',
  fillColor = 'var(--brand-soft)',
  strokeWidth = 1.5,
  className,
  ...props
}: SparklineProps) {
  if (!values || values.length < 2) {
    return (
      <div style={{ width, height }} className="flex items-center justify-center text-[color:var(--ink-400)] text-[11px]">
        —
      </div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y] as const;
  });

  const linePath = points.reduce((acc, [x, y], i) => acc + `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)} `, '');
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={'ui-spark ' + (className || '')}
      preserveAspectRatio="none"
      {...props}
    >
      <path d={areaPath} fill={fillColor} opacity={0.9} />
      <path d={linePath} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
    </svg>
  );
}
