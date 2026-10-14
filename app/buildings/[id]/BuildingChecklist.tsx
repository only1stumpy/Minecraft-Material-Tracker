"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { MaterialRow, toShulkers, toStacks } from "@/lib/materials";

type ChecklistRow = MaterialRow & {
  gatheredBy: string;
  isGathered: boolean;
};

type BuildingChecklistProps = {
  materials: MaterialRow[];
  initialChecklist: ChecklistRow[]; // Новое: начальное состояние из БД
  buildingId: string; // Новое: ID для API-запросов
};

const numberFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 2,
});

export default function BuildingChecklist({
  materials,
  initialChecklist,
  buildingId,
}: BuildingChecklistProps) {
  // Инициализируем состояние данными из базы, если они есть, иначе создаем пустой список
  const [rows, setRows] = useState<ChecklistRow[]>(() => {
    if (initialChecklist && initialChecklist.length > 0) {
      return initialChecklist;
    }
    return materials.map((row) => ({
      ...row,
      gatheredBy: "",
      isGathered: false,
    }));
  });

  // Реф, чтобы не сохранять данные при самом первом рендере
  const isFirstRender = useRef(true);

  // Функция для отправки данных на сервер
  const saveProgress = async (currentRows: ChecklistRow[]) => {
    try {
      await fetch(`/api/buildings/${buildingId}/checklist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklist: currentRows }),
      });
    } catch (error) {
      console.error("Ошибка при сохранении чеклиста:", error);
    }
  };

  // Эффект дебаунса: сохраняет данные через 1 секунду после последнего изменения
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timer = setTimeout(() => {
      saveProgress(rows);
    }, 1000);

    return () => clearTimeout(timer);
  }, [rows]);

  const totals = useMemo(() => {
    const totalBlocks = rows.reduce((sum, row) => sum + row.total, 0);
    const totalStacks = rows.reduce((sum, row) => sum + toStacks(row.total), 0);
    const totalShulkers = rows.reduce(
      (sum, row) => sum + toShulkers(row.total),
      0,
    );

    return { totalBlocks, totalStacks, totalShulkers };
  }, [rows]);

  const updateGatheredBy = (item: string, value: string) => {
    setRows((prev) =>
      prev.map((row) =>
        row.item === item ? { ...row, gatheredBy: value } : row,
      ),
    );
  };

  const toggleGathered = (item: string) => {
    setRows((prev) =>
      prev.map((row) =>
        row.item === item ? { ...row, isGathered: !row.isGathered } : row,
      ),
    );
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-sm text-slate-400">
        Не удалось распарсить материалы. Проверьте файл ресурсов.
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex flex-col gap-2 text-sm text-slate-300 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-4">
          <span>
            Всего блоков: {numberFormatter.format(totals.totalBlocks)}
          </span>
          <span>
            Всего стаков: {numberFormatter.format(totals.totalStacks)}
          </span>
          <span>
            Всего шалкеров: {numberFormatter.format(totals.totalShulkers)}
          </span>
        </div>
        <div className="text-xs text-slate-500 italic">
          Автосохранение включено
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800">
        <div className="grid grid-cols-[0.4fr_1.6fr_0.6fr_0.6fr_0.6fr_1fr] gap-2 bg-slate-950 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <span>Собрано</span>
          <span>Блок</span>
          <span className="text-right">Количество</span>
          <span className="text-right">В стаках</span>
          <span className="text-right">В шалкерах</span>
          <span>Кто добыл</span>
        </div>
        <div className="max-h-[520px] divide-y divide-slate-800 overflow-auto">
          {rows.map((row) => (
            <div
              key={row.item}
              className={`grid grid-cols-[0.4fr_1.6fr_0.6fr_0.6fr_0.6fr_1fr] gap-2 px-4 py-3 text-sm transition-colors ${
                row.isGathered
                  ? "bg-emerald-500/5 text-slate-400"
                  : "text-slate-200"
              }`}
            >
              <label className="flex items-center justify-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={row.isGathered}
                  onChange={() => toggleGathered(row.item)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-400 focus:ring-0 focus:ring-offset-0"
                />
              </label>
              <span className={row.isGathered ? "line-through opacity-50" : ""}>
                {row.item}
              </span>
              <span className="text-right font-mono text-xs">
                {numberFormatter.format(row.total)}
              </span>
              <span className="text-right font-mono text-xs text-slate-400">
                {numberFormatter.format(toStacks(row.total))}
              </span>
              <span className="text-right font-mono text-xs text-slate-500">
                {numberFormatter.format(toShulkers(row.total))}
              </span>
              <input
                type="text"
                value={row.gatheredBy}
                onChange={(event) =>
                  updateGatheredBy(row.item, event.target.value)
                }
                placeholder="ник"
                className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-1.5 text-xs text-slate-100 outline-none transition focus:border-emerald-400/60"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
