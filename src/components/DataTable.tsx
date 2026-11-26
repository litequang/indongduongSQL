import { useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  ArrowUpDown,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Button } from "./ui/button";
import { EmptyState, LoadingSkeleton } from "./common";
export function DataToolbar({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="data-toolbar">
      <div className="toolbar-filters">{children}</div>
      <div className="toolbar-actions">{actions}</div>
    </div>
  );
}
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="filter-bar">{children}</div>;
}
export function DataTable<T>({
  data,
  columns,
  total,
  page,
  pageSize,
  onPage,
  onPageSize,
  sorting,
  onSorting,
  loading,
  onRow,
}: {
  data: T[];
  columns: ColumnDef<T, any>[];
  total: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  sorting: SortingState;
  onSorting: (sort: SortingState) => void;
  loading?: boolean;
  onRow?: (row: T) => void;
}) {
  const [visibility, setVisibility] = useState<VisibilityState>(() => {
    try {
      return JSON.parse(localStorage.getItem("idd.ui.user-columns") || "{}");
    } catch {
      return {};
    }
  });
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    pageCount: Math.ceil(total / pageSize),
    state: {
      sorting,
      columnVisibility: visibility,
      pagination: { pageIndex: page - 1, pageSize },
    },
    onSortingChange: (update) =>
      onSorting(typeof update === "function" ? update(sorting) : update),
    onColumnVisibilityChange: (update) => {
      setVisibility((current) => {
        const next = typeof update === "function" ? update(current) : update;
        try {
          localStorage.setItem("idd.ui.user-columns", JSON.stringify(next));
        } catch {
          /* Optional UI preference. */
        }
        return next;
      });
    },
  });
  return (
    <div className="data-table">
      <div className="table-meta">
        <span>{total.toLocaleString("vi-VN")} nhân viên</span>
        <details className="column-picker">
          <summary>
            <SlidersHorizontal size={14} /> Cột hiển thị
          </summary>
          <div>
            {table
              .getAllLeafColumns()
              .filter((c) => c.getCanHide())
              .map((col) => (
                <label key={col.id}>
                  <input
                    type="checkbox"
                    checked={col.getIsVisible()}
                    onChange={col.getToggleVisibilityHandler()}
                  />
                  {String(col.columnDef.meta ?? col.id)}
                </label>
              ))}
          </div>
        </details>
      </div>
      {loading ? (
        <LoadingSkeleton />
      ) : data.length === 0 ? (
        <EmptyState
          title="Chưa tìm thấy nhân viên"
          description="Thử thay đổi tìm kiếm hoặc thêm nhân viên đầu tiên."
        />
      ) : (
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        className="sort-button"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        <ArrowUpDown size={13} />
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} onClick={() => onRow?.(row.original)}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <div className="table-pagination">
        <span>
          {total
            ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)}`
            : "0"}{" "}
          trên {total}
        </span>
        <div>
          <label className="page-size">
            <span>Mỗi trang</span>
            <select
              aria-label="Số dòng mỗi trang"
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
            >
              {[10, 20, 50].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <Button
            size="icon"
            variant="outline"
            aria-label="Trang trước"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft />
          </Button>
          <span>
            {page} / {Math.max(1, Math.ceil(total / pageSize))}
          </span>
          <Button
            size="icon"
            variant="outline"
            aria-label="Trang sau"
            disabled={page * pageSize >= total}
            onClick={() => onPage(page + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
