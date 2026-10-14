"use client";

import { upload } from "@vercel/blob/client";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { MAX_MATERIALS_TEXT_BYTES, normalizeMaterialName, parseMaterials } from "@/lib/materials";

export type BuildingFormMaterial = { name: string; requiredQty: number; stackSize: number; allowSurplus: boolean };
export type BuildingFormUser = { id: string; minecraftNickname: string };
export type BuildingFormInitial = {
  id?: string;
  version?: number;
  name: string;
  description: string;
  x: number | null;
  y: number | null;
  z: number | null;
  status: string;
  schematicPath: string | null;
  schematicFileName: string | null;
  screenshotPath: string | null;
  legacyScreenshotDataUrl?: string | null;
  materialsFileName: string | null;
  materials: BuildingFormMaterial[];
  ownerId: string | null;
  responsibleId: string | null;
};

const STATUS_OPTIONS = [
  ["DRAFT", "Черновик"], ["PLANNED", "Запланировано"], ["COLLECTING", "Сбор ресурсов"],
  ["READY", "Готово к строительству"], ["BUILDING", "Строится"], ["COMPLETED", "Завершено"],
  ["PAUSED", "Приостановлено"], ["ARCHIVED", "Архивировано"],
] as const;

const MAX_SCHEMATIC_BYTES = 50 * 1024 * 1024;
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const MAX_SCREENSHOT_INPUT_BYTES = 24 * 1024 * 1024;

type FormResponse = { error?: string; building?: { id: string }; duplicates?: unknown[]; materialErrors?: Array<{ index: number; message: string }> };

function guessContentType(file: File) {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : ext === "txt" || ext === "log" ? "text/plain" : "application/octet-stream";
}

async function optimizeScreenshot(file: File): Promise<File> {
  if (file.size > MAX_SCREENSHOT_INPUT_BYTES) throw new Error("Исходное изображение превышает 24 MiB.");
  if (typeof createImageBitmap !== "function") {
    if (file.size > MAX_SCREENSHOT_BYTES) throw new Error("Браузер не поддерживает сжатие изображения; выберите файл до 8 MiB.");
    return file;
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / bitmap.width, 1600 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Не удалось обработать изображение.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.84));
    if (!blob) throw new Error("Не удалось сжать изображение.");
    const optimized = new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), { type: blob.type, lastModified: Date.now() });
    const result = optimized.size < file.size ? optimized : file;
    if (result.size > MAX_SCREENSHOT_BYTES) throw new Error("После оптимизации скриншот должен быть не больше 8 MiB.");
    return result;
  } finally {
    bitmap.close();
  }
}

export default function BuildingForm({
  initial,
  userId,
  hasProgress = false,
  assignableUsers = [],
  canChangeOwner = false,
}: {
  initial: BuildingFormInitial;
  userId: string;
  hasProgress?: boolean;
  assignableUsers?: BuildingFormUser[];
  canChangeOwner?: boolean;
}) {
  const router = useRouter();
  const materialsInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [x, setX] = useState(initial.x?.toString() ?? "");
  const [y, setY] = useState(initial.y?.toString() ?? "");
  const [z, setZ] = useState(initial.z?.toString() ?? "");
  const [status, setStatus] = useState(initial.status);
  const [ownerId, setOwnerId] = useState(initial.ownerId ?? "");
  const [responsibleId, setResponsibleId] = useState(initial.responsibleId ?? "");
  const [materialsFileName, setMaterialsFileName] = useState(initial.materialsFileName ?? "");
  const [materialsText, setMaterialsText] = useState("");
  const [parseErrors, setParseErrors] = useState<Array<{ line: number; raw: string; message: string }>>([]);
  const [materials, setMaterials] = useState<BuildingFormMaterial[]>(initial.materials);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [schematicFile, setSchematicFile] = useState<File | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [optimizingScreenshot, setOptimizingScreenshot] = useState(false);
  const [screenshotError, setScreenshotError] = useState("");
  const [removeSchematic, setRemoveSchematic] = useState(false);
  const [removeScreenshot, setRemoveScreenshot] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => () => {
    if (screenshotPreview?.startsWith("blob:")) URL.revokeObjectURL(screenshotPreview);
  }, [screenshotPreview]);

  async function selectScreenshot(file: File | null) {
    setScreenshotError("");
    if (!file) {
      setScreenshotFile(null);
      setScreenshotPreview(null);
      return;
    }
    if (!/\.(png|jpe?g|webp)$/i.test(file.name)) {
      setScreenshotError("Поддерживаются PNG, JPEG и WebP.");
      return;
    }
    setOptimizingScreenshot(true);
    try {
      const optimized = await optimizeScreenshot(file);
      setScreenshotFile(optimized);
      setScreenshotPreview(URL.createObjectURL(optimized));
      setRemoveScreenshot(false);
    } catch (error) {
      setScreenshotError(error instanceof Error ? error.message : "Не удалось обработать скриншот.");
    } finally {
      setOptimizingScreenshot(false);
    }
  }

  const duplicateNames = useMemo(() => {
    const seen = new Set<string>();
    const duplicate = new Set<string>();
    for (const row of materials) {
      const normalized = normalizeMaterialName(row.name);
      if (seen.has(normalized)) duplicate.add(normalized);
      seen.add(normalized);
    }
    return duplicate;
  }, [materials]);

  function parseText(text: string) {
    setMaterialsText(text);
    const parsed = parseMaterials(text);
    setParseErrors(parsed.errors);
    if (parsed.rows.length > 0) {
      setMaterials(parsed.rows.map((row) => ({ name: row.item, requiredQty: row.total, stackSize: row.stackSize, allowSurplus: false })));
      setSelectedRows([]);
    }
  }

  async function readMaterialsFile(file: File | null) {
    if (!file) return;
    setMaterialsFileName(file.name);
    if (file.size > MAX_MATERIALS_TEXT_BYTES) {
      setMaterialsText("");
      setParseErrors([{ line: 0, raw: file.name, message: "Файл материалов превышает 2 MiB" }]);
      return;
    }
    parseText(await file.text());
  }

  function setMaterial(index: number, patch: Partial<BuildingFormMaterial>) {
    setMaterials((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  function addMaterial() {
    setMaterials((rows) => [...rows, { name: "", requiredQty: 0, stackSize: 64, allowSurplus: false }]);
  }

  function mergeDuplicates() {
    if (!window.confirm("Объединить строки с одинаковым названием? Их количество сложится.")) return;
    const merged = new Map<string, BuildingFormMaterial>();
    for (const row of materials) {
      const key = normalizeMaterialName(row.name);
      const old = merged.get(key);
      merged.set(key, old ? { ...old, requiredQty: old.requiredQty + row.requiredQty, allowSurplus: old.allowSurplus || row.allowSurplus } : row);
    }
    setMaterials([...merged.values()]);
  }

  function removeSelected() {
    if (!selectedRows.length || !window.confirm(`Удалить выбранные строки (${selectedRows.length})?`)) return;
    const remove = new Set(selectedRows);
    setMaterials((rows) => rows.filter((_, index) => !remove.has(String(index))));
    setSelectedRows([]);
  }

  async function uploadFile(file: File, kind: "schematic" | "screenshot") {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const pathname = `building-assets/${userId}/${kind}-${crypto.randomUUID()}.${extension}`;
    const blob = await upload(pathname, file, {
      access: "private",
      handleUploadUrl: "/api/uploads",
      clientPayload: kind,
      contentType: guessContentType(file),
      multipart: kind === "schematic" && file.size > 4.5 * 1024 * 1024,
      onUploadProgress: ({ percentage }) => setUploadProgress(Math.round(percentage)),
    });
    return blob.pathname;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (parseErrors.length) {
      setError("Сначала исправьте проблемные строки исходного файла материалов.");
      return;
    }
    if (duplicateNames.size) {
      setError("В списке есть дубли материалов. Объедините их после подтверждения или переименуйте.");
      return;
    }
    if (!name.trim()) {
      setError("Укажите название постройки.");
      return;
    }
    if (schematicFile) {
      const ext = schematicFile.name.split(".").pop()?.toLowerCase();
      if (ext !== "litematic" && ext !== "schem") { setError("Схема должна быть .litematic или .schem."); return; }
      if (schematicFile.size > MAX_SCHEMATIC_BYTES) { setError("Схема превышает 50 MiB."); return; }
      if (hasProgress && !window.confirm("Заменить схему? Текущий сбор материалов сохранится.")) return;
    }
    if (screenshotFile) {
      if (!/\.(png|jpe?g|webp)$/i.test(screenshotFile.name) || screenshotFile.size > MAX_SCREENSHOT_BYTES) { setError("Оптимизированный скриншот должен быть PNG/JPEG/WebP и не больше 8 MiB."); return; }
      if (initial.screenshotPath && !window.confirm("Заменить текущий скриншот?")) return;
    }
    const parsedCoords = [x, y, z].map((value) => value.trim() === "" ? null : Number(value));
    if (parsedCoords.some((value) => value !== null && (!Number.isSafeInteger(value) || value < -2_147_483_648 || value > 2_147_483_647))) {
      setError("Координаты должны быть целыми числами.");
      return;
    }
    if (description.length > 10_000) { setError("Описание не должно превышать 10 000 символов."); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(), description: description.trim() || null,
        x: parsedCoords[0], y: parsedCoords[1], z: parsedCoords[2], status,
        materials: materials.map((row) => ({ ...row, name: row.name.trim() })),
        materialsFileName: materialsFileName || null,
        responsibleId: responsibleId || null,
      };
      if (initial.version !== undefined) body.expectedVersion = initial.version;
      if (initial.id && canChangeOwner) body.ownerId = ownerId || null;
      if (schematicFile) {
        setUploadProgress(0);
        body.schematicPath = await uploadFile(schematicFile, "schematic");
        body.schematicFileName = schematicFile.name;
      } else if (removeSchematic) {
        body.schematicPath = null;
        body.schematicFileName = null;
      }
      if (screenshotFile) {
        setUploadProgress(0);
        body.screenshotPath = await uploadFile(screenshotFile, "screenshot");
      } else if (removeScreenshot) body.screenshotPath = null;

      const url = initial.id ? `/api/buildings/${encodeURIComponent(initial.id)}` : "/api/buildings";
      const method = initial.id ? "PATCH" : "POST";
      let response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      let result = await response.json().catch(() => null) as FormResponse | null;
      if (!response.ok && response.status === 409 && Array.isArray(result?.duplicates) && result.duplicates.length > 0 && window.confirm(`${result.error ?? "Найдены дубли"}\n\nПродолжить с объединением совпадающих материалов или подтвердить дубликат постройки?`)) {
        if (result.error?.includes("материал")) body.mergeDuplicates = true;
        else body.confirmDuplicateBuilding = true;
        response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        result = await response.json().catch(() => null) as FormResponse | null;
      }
      if (!response.ok) {
        if (result?.materialErrors?.length) setParseErrors(result.materialErrors.map((entry) => ({ line: entry.index + 1, raw: "", message: entry.message })));
        throw new Error(result?.error ?? "Не удалось сохранить постройку.");
      }
      const id = result?.building?.id ?? initial.id;
      setSuccess("Изменения сохранены.");
      if (id) router.push(`/buildings/${encodeURIComponent(id)}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  }

  const ownerName = assignableUsers.find((candidate) => candidate.id === ownerId)?.minecraftNickname;

  return <form onSubmit={submit} className="glass-panel space-y-8 rounded-[2rem] p-5 md:p-8">
    <div className="grid gap-5 md:grid-cols-2">
      <label className="grid gap-2 text-sm text-slate-300">Название постройки<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="glass-control rounded-2xl px-4 py-3 text-white" /></label>
      <label className="grid gap-2 text-sm text-slate-300">Статус<select value={status} onChange={(event) => setStatus(event.target.value)} className="glass-control rounded-2xl px-4 py-3 text-white">{STATUS_OPTIONS.filter(([value]) => initial.id || value === "DRAFT" || value === "PLANNED").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <label className="grid gap-2 text-sm text-slate-300">Описание<textarea maxLength={10_000} value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="glass-control rounded-2xl px-4 py-3 text-white" placeholder="Коротко о постройке и её назначении" /></label>
    <section className="space-y-4 border-t border-white/10 pt-7">
      <div><h2 className="text-xl font-semibold text-white">Ответственные</h2><p className="mt-1 text-sm text-slate-400">Назначение доступно только незаблокированным пользователям.</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        {initial.id && canChangeOwner ? <label className="grid gap-2 text-sm text-slate-300">Владелец<select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} disabled={saving} className="glass-control rounded-2xl px-4 py-3 text-white"><option value="">Не назначен</option>{assignableUsers.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.minecraftNickname}</option>)}</select></label> : initial.id ? <p className="glass-panel-soft rounded-2xl px-4 py-3 text-sm text-slate-300">Владелец: <span className="text-white">{ownerName ?? "не назначен"}</span></p> : null}
        <label className="grid gap-2 text-sm text-slate-300">Ответственный<select value={responsibleId} onChange={(event) => setResponsibleId(event.target.value)} disabled={saving} className="glass-control rounded-2xl px-4 py-3 text-white"><option value="">Не назначен</option>{assignableUsers.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.minecraftNickname}</option>)}</select></label>
      </div>
    </section>
    <fieldset className="space-y-3"><legend className="text-sm font-semibold text-slate-200">Координаты (необязательно)</legend><div className="grid gap-3 sm:grid-cols-3">{([["X", x, setX], ["Y", y, setY], ["Z", z, setZ]] as const).map(([label, value, setter]) => <label key={label} className="grid gap-1 text-xs text-slate-400">{label}<input inputMode="numeric" value={value} onChange={(event) => setter(event.target.value)} className="glass-control rounded-2xl px-4 py-3 text-sm text-white" /></label>)}</div></fieldset>

    <section className="space-y-4 border-t border-white/10 pt-7">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold text-white">Схема и скриншот</h2><p className="mt-1 text-sm text-slate-400">Файлы хранятся приватно; схему можно заменить без сброса прогресса.</p></div></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="glass-panel-soft space-y-2 rounded-2xl p-4"><label className="grid gap-2 text-sm text-slate-300">Схема .litematic / .schem (до 50 MiB)<input type="file" accept=".litematic,.schem" onChange={(event) => setSchematicFile(event.target.files?.[0] ?? null)} className="text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-100" /></label>{initial.schematicFileName && !removeSchematic && <p className="text-xs text-slate-400">Сейчас: {initial.schematicFileName}</p>}{initial.schematicPath && <button type="button" onClick={() => setRemoveSchematic((value) => !value)} className="text-xs text-rose-300 hover:underline">{removeSchematic ? "Оставить текущую схему" : "Убрать схему"}</button>}</div>
        <div
          className="glass-panel-soft space-y-3 rounded-2xl border-dashed border-rose-200/30 p-4"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); void selectScreenshot(event.dataTransfer.files[0] ?? null); }}
        >
          <label className="grid cursor-pointer gap-2 text-sm text-slate-300">Скриншот PNG/JPEG/WebP · до 8 MiB после оптимизации · перетащите файл сюда
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void selectScreenshot(event.target.files?.[0] ?? null)} className="text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-100" />
          </label>
          {optimizingScreenshot && <p role="status" className="text-xs text-slate-400">Оптимизируем скриншот…</p>}
          {screenshotError && <p role="alert" className="text-xs text-rose-300">{screenshotError}</p>}
          {!removeScreenshot && (screenshotPreview || initial.screenshotPath || initial.legacyScreenshotDataUrl) && <Image src={screenshotPreview ?? (initial.screenshotPath ? `/api/files/${initial.screenshotPath.split("/").map(encodeURIComponent).join("/")}` : initial.legacyScreenshotDataUrl!)} alt="Предпросмотр скриншота постройки" width={1600} height={900} unoptimized className="max-h-56 rounded-xl border border-slate-800 object-contain" />}
          {(initial.screenshotPath || initial.legacyScreenshotDataUrl) && <button type="button" onClick={() => setRemoveScreenshot((value) => !value)} className="text-xs text-rose-300 hover:underline">{removeScreenshot ? "Оставить скриншот" : "Убрать скриншот"}</button>}
        </div>
      </div>
      {saving && uploadProgress > 0 && <p role="status" className="text-sm text-rose-200">Загрузка файла: {uploadProgress}%</p>}
    </section>

    <section className="space-y-4 border-t border-white/10 pt-7">
      <div><h2 className="text-xl font-semibold text-white">Материалы</h2><p className="mt-1 text-sm text-slate-400">Загрузите .txt/.log или вставьте таблицу Litematica. Исправьте предпросмотр до сохранения.</p></div>
      <label className="grid gap-2 text-sm text-slate-300">Файл материалов<input ref={materialsInput} type="file" accept=".txt,.log,text/plain" onChange={(event) => void readMaterialsFile(event.target.files?.[0] ?? null)} className="text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-100" /></label>
      <label className="grid gap-2 text-sm text-slate-300">Вставить / изменить исходный текст<textarea value={materialsText} onChange={(event) => parseText(event.target.value)} rows={7} className="glass-control rounded-2xl px-4 py-3 font-mono text-xs text-white" placeholder="| Item | Total | Missing | Available |" /></label>
      {parseErrors.length > 0 && <div role="alert" className="space-y-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200"><p>Проблемные строки: {parseErrors.length}</p><ul className="list-inside list-disc">{parseErrors.slice(0, 20).map((item, index) => <li key={`${item.line}-${index}`}>Строка {item.line || "—"}: {item.message}{item.raw && <code className="ml-2 text-xs">{item.raw.slice(0, 180)}</code>}</li>)}</ul></div>}
      <div className="flex flex-wrap gap-2"><button type="button" onClick={addMaterial} className="glass-control rounded-xl px-4 py-2 text-sm text-slate-200">+ Добавить материал вручную</button><button type="button" disabled={!selectedRows.length} onClick={removeSelected} className="rounded-xl border border-rose-500/40 px-4 py-2 text-sm text-rose-200 disabled:opacity-40">Удалить выбранные</button>{duplicateNames.size > 0 && <button type="button" onClick={mergeDuplicates} className="rounded-xl border border-amber-500/50 px-4 py-2 text-sm text-amber-100">Объединить дубли…</button>}</div>
      {materials.length === 0 ? <p className="rounded-xl border border-dashed border-rose-200/20 p-6 text-center text-sm text-slate-500">Материалов пока нет.</p> : <div className="glass-panel-soft overflow-x-auto rounded-2xl"><table className="w-full min-w-[720px] text-left text-sm"><thead className="sticky top-0 bg-[#110d11] text-xs text-slate-400"><tr><th className="p-3"><span className="sr-only">Выбрать</span></th><th className="p-3">Материал</th><th className="p-3">Нужно</th><th className="p-3">Размер стака</th><th className="p-3">Избыток</th><th className="p-3">Удалить</th></tr></thead><tbody>{materials.map((row, index) => <tr key={`${index}-${row.name}`} className="border-t border-white/10"><td className="p-3"><input type="checkbox" aria-label={`Выбрать ${row.name || `строку ${index + 1}`}`} checked={selectedRows.includes(String(index))} onChange={(event) => setSelectedRows((selected) => event.target.checked ? [...selected, String(index)] : selected.filter((item) => item !== String(index)))} className="accent-rose-400" /></td><td className="p-3"><input aria-label="Название материала" value={row.name} onChange={(event) => setMaterial(index, { name: event.target.value })} className="glass-control w-full rounded-lg px-3 py-2" /></td><td className="p-3"><input aria-label="Требуемое количество" inputMode="numeric" value={row.requiredQty} onChange={(event) => setMaterial(index, { requiredQty: Number(event.target.value) })} className="glass-control w-28 rounded-lg px-3 py-2" /></td><td className="p-3"><input aria-label="Размер стака" inputMode="numeric" value={row.stackSize} onChange={(event) => setMaterial(index, { stackSize: Number(event.target.value) })} className="glass-control w-24 rounded-lg px-3 py-2" /></td><td className="p-3"><input type="checkbox" aria-label="Разрешить контролируемый избыток" checked={row.allowSurplus} onChange={(event) => setMaterial(index, { allowSurplus: event.target.checked })} className="accent-rose-400" /></td><td className="p-3"><button type="button" onClick={() => setMaterials((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Удалить ${row.name || `строку ${index + 1}`}`} className="rounded-lg px-2 py-1 text-rose-300 hover:bg-rose-950">×</button></td></tr>)}</tbody></table></div>}
      <p className="text-xs text-slate-500">Позиции: {materials.length}. Повторное сохранение материалов не сбрасывает вклад: удалённые позиции архивируются.</p>
    </section>

    {error && <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</p>}
    {success && <p role="status" className="text-sm text-rose-200">{success}</p>}
    <button type="submit" disabled={saving || optimizingScreenshot} className="glass-action-primary w-full rounded-2xl px-6 py-3 disabled:cursor-wait disabled:opacity-50">{saving ? "Сохраняем…" : initial.id ? "Сохранить изменения" : "Создать постройку"}</button>
  </form>;
}
