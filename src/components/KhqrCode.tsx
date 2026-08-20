function cellsFrom(seed: string) {
  const size = 21
  const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false))
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  const rand = () => {
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h >>> 0) % 1000) / 1000
  }
  const finder = (x: number, y: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const edge = r === 0 || c === 0 || r === 6 || c === 6
        const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4
        grid[y + r][x + c] = edge || inner
      }
    }
  }
  finder(0, 0)
  finder(14, 0)
  finder(0, 14)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const inFinder =
        (r < 8 && c < 8) || (r < 8 && c > 12) || (r > 12 && c < 8)
      if (!inFinder) grid[r][c] = rand() > 0.46
    }
  }
  return grid
}

export default function KhqrCode({ seed, size = 220 }: { seed: string; size?: number }) {
  const grid = cellsFrom(seed)
  const n = grid.length
  const cell = size / n
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rounded-2xl bg-white p-2 shadow-sm">
      {grid.flatMap((row, r) =>
        row.map((on, c) =>
          on ? (
            <rect
              key={`${r}-${c}`}
              x={c * cell}
              y={r * cell}
              width={cell}
              height={cell}
              fill="#3B0A1F"
            />
          ) : null,
        ),
      )}
      <rect x={size / 2 - 18} y={size / 2 - 18} width={36} height={36} rx={10} fill="#FDF2F6" />
      <circle cx={size / 2} cy={size / 2} r={10} fill="#F472B6" />
      <circle cx={size / 2} cy={size / 2} r={4} fill="#3B82F6" />
    </svg>
  )
}
