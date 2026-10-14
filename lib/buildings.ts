import { MaterialRow } from "./materials";

export type Building = {
  id: string;
  name: string;
  coordinates: {
    x: string;
    y: string;
    z: string;
  };
  schematicFileName: string;
  materialsFileName: string;
  screenshotDataUrl?: string | null;
  materials: MaterialRow[];
};

const buildingStore = new Map<string, Building>();

const generateId = () =>
  `build-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const createBuilding = (building: Omit<Building, "id">) => {
  const id = generateId();
  const record: Building = { ...building, id };
  buildingStore.set(id, record);
  return record;
};

export const getBuilding = (id: string) => buildingStore.get(id) ?? null;
