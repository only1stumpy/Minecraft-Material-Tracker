"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  assigneeId: string | null;
  assignee: { minecraftNickname: string } | null;
};
type Comment = {
  id: string;
  body: string;
  createdAt: Date;
  authorId: string;
  materialId: string | null;
  material: { name: string } | null;
  author: { minecraftNickname: string };
};
type MaterialOption = { id: string; name: string };

const TASK_STATUS: Record<Task["status"], string> = { OPEN: "Открыта", IN_PROGRESS: "В работе", DONE: "Готово", CANCELLED: "Отменена" };

async function errorMessage(response: Response) {
  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : "Операция не выполнена";
}

export default function CollaborationPanel({
  buildingId,
  currentUserId,
  canManage,
  canModerate,
  tasks,
  comments,
  materials,
}: {
  buildingId: string;
  currentUserId: string;
  canManage: boolean;
  canModerate: boolean;
  tasks: Task[];
  comments: Comment[];
  materials: MaterialOption[];
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [assigneeNickname, setAssigneeNickname] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("comment"); setError("");
    try {
      const response = await fetch(`/api/buildings/${encodeURIComponent(buildingId)}/comments`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: comment, materialId: materialId || null }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      setComment(""); setMaterialId(""); router.refresh();
    } catch (errorValue) { setError(errorValue instanceof Error ? errorValue.message : "Не удалось добавить комментарий"); }
    finally { setPending(null); }
  }

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("task"); setError("");
    try {
      const response = await fetch(`/api/buildings/${encodeURIComponent(buildingId)}/tasks`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: taskTitle, description: taskDescription || null, assigneeNickname: assigneeNickname || null }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      setTaskTitle(""); setTaskDescription(""); setAssigneeNickname(""); router.refresh();
    } catch (errorValue) { setError(errorValue instanceof Error ? errorValue.message : "Не удалось создать задачу"); }
    finally { setPending(null); }
  }

  async function updateTask(task: Task, status: Task["status"]) {
    setPending(task.id); setError("");
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      router.refresh();
    } catch (errorValue) { setError(errorValue instanceof Error ? errorValue.message : "Не удалось изменить задачу"); }
    finally { setPending(null); }
  }

  async function moderateComment(id: string, hidden: boolean) {
    setPending(id); setError("");
    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ hidden }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      router.refresh();
    } catch (errorValue) { setError(errorValue instanceof Error ? errorValue.message : "Не удалось изменить комментарий"); }
    finally { setPending(null); }
  }

  return <section className="grid gap-6 lg:grid-cols-2">
    <div className="glass-panel space-y-4 rounded-[2rem] p-5 md:p-6">
      <header><p className="glass-eyebrow">Команда</p><h2 className="mt-2 text-2xl font-semibold text-white">Задачи строительства</h2><p className="mt-1 text-sm text-slate-400">Назначения отделены от сбора ресурсов.</p></header>
      {canManage && <form onSubmit={submitTask} className="grid gap-2 glass-panel-soft rounded-2xl p-4"><label className="text-xs text-slate-400">Название задачи<input required maxLength={160} value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} className="mt-1 w-full glass-control rounded-xl px-3 py-2 text-sm text-white" placeholder="Например, подготовить фундамент" /></label><label className="text-xs text-slate-400">Описание<textarea maxLength={2000} value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} rows={2} className="mt-1 w-full glass-control rounded-xl px-3 py-2 text-sm text-white" /></label><div className="flex flex-wrap gap-2"><label className="min-w-40 flex-1 text-xs text-slate-400">Исполнитель по Minecraft-нику<input maxLength={16} value={assigneeNickname} onChange={(event) => setAssigneeNickname(event.target.value)} className="mt-1 w-full glass-control rounded-xl px-3 py-2 text-sm text-white" /></label><button disabled={pending === "task"} className="self-end glass-action-primary rounded-xl px-4 py-2 text-sm disabled:opacity-50">Добавить задачу</button></div></form>}
      {tasks.length === 0 ? <p className="glass-panel-soft rounded-xl p-4 text-sm text-slate-500">Задач пока нет.</p> : <ul className="space-y-2">{tasks.map((task) => <li key={task.id} className="glass-panel-soft rounded-xl p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium text-white">{task.title}</p>{task.description && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-400">{task.description}</p>}<p className="mt-2 text-xs text-slate-500">{task.assignee ? `Исполнитель: ${task.assignee.minecraftNickname}` : "Без исполнителя"}</p></div><span className="glass-pill rounded-full px-3 py-1 text-xs">{TASK_STATUS[task.status]}</span></div>{(canManage || task.assigneeId === currentUserId) && task.status !== "DONE" && task.status !== "CANCELLED" && <div className="mt-3 flex gap-2">{task.status === "OPEN" && <button type="button" disabled={pending === task.id} onClick={() => void updateTask(task, "IN_PROGRESS")} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200">Взять</button>}<button type="button" disabled={pending === task.id} onClick={() => void updateTask(task, "DONE")} className="rounded-lg glass-control px-3 py-1.5 text-xs text-rose-100">Завершить</button>{canManage && <button type="button" disabled={pending === task.id} onClick={() => void updateTask(task, "CANCELLED")} className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs text-rose-200">Отменить</button>}</div>}</li>)}</ul>}
    </div>

    <div className="glass-panel space-y-4 rounded-[2rem] p-5 md:p-6">
      <header><p className="glass-eyebrow">Обратная связь</p><h2 className="mt-2 text-2xl font-semibold text-white">Обсуждение</h2><p className="mt-1 text-sm text-slate-400">Комментарии остаются в истории постройки и могут быть привязаны к материалу.</p></header>
      <form onSubmit={submitComment} className="space-y-2 glass-panel-soft rounded-2xl p-4"><label className="sr-only" htmlFor="comment-material">Материал для комментария</label><select id="comment-material" value={materialId} onChange={(event) => setMaterialId(event.target.value)} className="w-full glass-control rounded-xl px-3 py-2 text-xs text-slate-300"><option value="">Комментарий к постройке</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select><label className="sr-only" htmlFor="building-comment">Новый комментарий</label><textarea id="building-comment" required maxLength={3000} value={comment} onChange={(event) => setComment(event.target.value)} rows={3} className="w-full glass-control rounded-xl px-3 py-2 text-sm text-white" placeholder="Напишите комментарий" /><button disabled={pending === "comment"} className="glass-action-primary rounded-xl px-4 py-2 text-sm disabled:opacity-50">Добавить комментарий</button></form>
      {comments.length === 0 ? <p className="glass-panel-soft rounded-xl p-4 text-sm text-slate-500">Обсуждение пока пустое.</p> : <ul className="max-h-[34rem] space-y-2 overflow-y-auto">{comments.map((item) => <li key={item.id} className="glass-panel-soft rounded-xl p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-200">{item.author.minecraftNickname}{item.material && <span className="ml-2 font-normal text-rose-200">· {item.material.name}</span>}</p><time className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString("ru-RU")}</time></div><p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-300">{item.body}</p>{canModerate && <button type="button" disabled={pending === item.id} onClick={() => void moderateComment(item.id, true)} className="mt-2 text-xs text-rose-300 hover:underline">Скрыть комментарий</button>}</li>)}</ul>}
    </div>
    {error && <p role="alert" className="lg:col-span-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</p>}
  </section>;
}
