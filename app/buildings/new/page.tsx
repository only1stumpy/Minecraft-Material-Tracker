"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { parseMaterials } from "@/lib/materials";

const sampleText = `+----------------------------------------------+-------+---------+-----------+
| Список материалов голограммы 'Unnamed'                                     |
+----------------------------------------------+-------+---------+-----------+
| Item                                         | Total | Missing | Available |
+----------------------------------------------+-------+---------+-----------+
| Кирпичи                                      |  4974 |    4974 |         0 |
| Каменные кирпичи                             |  3200 |     396 |         0 |
| Дёрн                                         |  2462 |     244 |         0 |
+----------------------------------------------+-------+---------+-----------+`;

export default function NewBuildingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [z, setZ] = useState("");
  const [materialsText, setMaterialsText] = useState("");
  const [materialsFile, setMaterialsFile] = useState<File | null>(null);
  const [schematicFile, setSchematicFile] = useState<File | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsedPreview = useMemo(() => parseMaterials(materialsText), [materialsText]);

  const handleMaterialFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setMaterialsFile(file);
    if (file) {
      const text = await file.text();
      setMaterialsText(text);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!name || !x || !y || !z || !schematicFile || !materialsFile) {
      setError("Заполните обязательные поля и прикрепите файлы схемы и материалов.");
      return;
    }

    const formData = new FormData();
    formData.append("name", name);
    formData.append("x", x);
    formData.append("y", y);
    formData.append("z", z);
    formData.append("schematic", schematicFile);
    formData.append("materials", materialsFile);
    if (screenshotFile) {
      formData.append("screenshot", screenshotFile);
    }

    try {
      setIsSubmitting(true);
      const response = await fetch("/api/buildings", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Не удалось сохранить постройку.");
      }

      const data = (await response.json()) as { building: { id: string } };
      router.push(`/buildings/${data.building.id}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Произошла ошибка при сохранении."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-12">
        <header className="space-y-4">
          <Link href="/" className="text-sm text-emerald-300 hover:underline">
            ← Вернуться к списку
          </Link>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Antville Builder
          </p>
          <h1 className="text-4xl font-semibold text-white md:text-5xl">
            Новая постройка
          </h1>
          <p className="max-w-3xl text-base text-slate-300 md:text-lg">
            Заполните карточку постройки: загрузите схему Litematica, файл материалов и
            получите чек-лист для строительства.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-3xl border border-slate-800 bg-slate-900/60 p-6"
        >
          <div className="grid gap-6 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-300">
              Название постройки
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-400/60"
                placeholder="Ратуша, рынок, станция..."
                required
              />
            </label>
            <div className="space-y-2 text-sm text-slate-300">
              Координаты привязки
              <div className="grid grid-cols-3 gap-3">
                <input
                  value={x}
                  onChange={(event) => setX(event.target.value)}
                  className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-400/60"
                  placeholder="X"
                  required
                />
                <input
                  value={y}
                  onChange={(event) => setY(event.target.value)}
                  className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-400/60"
                  placeholder="Y"
                  required
                />
                <input
                  value={z}
                  onChange={(event) => setZ(event.target.value)}
                  className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-400/60"
                  placeholder="Z"
                  required
                />
              </div>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-300">
              Скриншот постройки (необязательно)
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setScreenshotFile(event.target.files?.[0] ?? null)}
                className="w-full rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-200"
              />
            </label>
            <label className="space-y-2 text-sm text-slate-300">
              Файл схемы Litematica (.litematic)
              <input
                type="file"
                accept=".litematic"
                onChange={(event) => setSchematicFile(event.target.files?.[0] ?? null)}
                className="w-full rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-200"
                required
              />
            </label>
          </div>

          <label className="space-y-2 text-sm text-slate-300">
            Файл материалов (.txt/.log)
            <input
              type="file"
              accept=".txt,.log"
              onChange={handleMaterialFile}
              className="w-full rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-200"
              required
            />
          </label>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-xs text-slate-400">Пример входных данных</p>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-slate-200">
              {sampleText}
            </pre>
          </div>

          <label className="space-y-2 text-sm text-slate-300">
            Предпросмотр распознанных материалов
            <textarea
              value={materialsText}
              onChange={(event) => setMaterialsText(event.target.value)}
              className="min-h-[160px] w-full rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-xs text-slate-200 outline-none transition focus:border-emerald-400/60"
              placeholder="Текст материалов появится здесь после загрузки файла."
            />
          </label>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-xs text-slate-300">
            {parsedPreview.length === 0
              ? "Файл не распознан — убедитесь, что таблица материалов не повреждена."
              : `Найдено материалов: ${parsedPreview.length}`}
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Создаём страницу..." : "Создать страницу постройки"}
          </button>
        </form>
      </main>
    </div>
  );
}
