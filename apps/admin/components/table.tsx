import type { ReactNode } from 'react';

/** A bordered table that scrolls sideways on a phone, with an empty and a loading line. */
export function Table({
  head,
  children,
  empty,
  loading,
}: {
  head: ReactNode[];
  children: ReactNode;
  /** shown under the header when set (no rows) */
  empty?: string | false;
  loading?: string | false;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-card">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-3 text-start font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line border-t border-line">{children}</tbody>
      </table>
      {empty && <p className="p-6 text-center text-sm text-muted">{empty}</p>}
      {loading && <p className="p-6 text-center text-sm text-muted">{loading}</p>}
    </div>
  );
}

/** A table cell with the usual padding. */
export function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
