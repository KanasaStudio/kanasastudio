import { ImageOff } from "lucide-react";
import { Card } from "../components/ui";
import type { Task } from "../lib/types";
import TasksPage from "./TasksPage";

const isCreative = (t: Task) => t.department_id === "creative" || t.kind === "design";

export default function CreativePage({ id }: { id?: string }) {
  return (
    <>
      <div className="mx-auto max-w-6xl px-4 pt-3">
        <Card className="flex items-start gap-3 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent"><ImageOff className="h-5 w-5" /></span>
          <p className="text-sm text-muted">
            Proyek kreatif berisi konsep visual, arah brand, spesifikasi aset 3D/2D, dan konsep UI/UX dari tim Creative & Design.
            Pembuatan gambar otomatis belum dihubungkan, jadi hasilnya berupa konsep & spesifikasi tertulis (palet hex, tipografi, polycount), bukan file gambar.
          </p>
        </Card>
      </div>
      <TasksPage id={id} kindFilter={isCreative} />
    </>
  );
}
