import { Scene, Source } from "../../shared/types";

const managedName = /^(scripture|lyrics?|song|lower[ -]?third)\b/i;

export const isPresentationTextSource = (source: Source | undefined): source is Extract<Source, { type: "text" }> =>
  Boolean(
    source?.type === "text"
    && (source.data.role === "presentation" || source.data.role === "lower-third" || managedName.test(source.name))
  );

export const removePresentationTextSources = (
  scene: Scene,
  sources: Record<string, Source>
) => {
  const removedIds = new Set(scene.sourceIds.filter((sourceId) => isPresentationTextSource(sources[sourceId])));
  if (removedIds.size === 0) return { scene, sources, removedIds };
  const nextSources = Object.fromEntries(
    Object.entries(sources).filter(([sourceId]) => !removedIds.has(sourceId))
  ) as Record<string, Source>;
  return {
    scene: { ...scene, sourceIds: scene.sourceIds.filter((sourceId) => !removedIds.has(sourceId)) },
    sources: nextSources,
    removedIds
  };
};

export const visiblePresentationSourceIds = (
  scene: Scene | null,
  sources: Record<string, Source>,
  allowMultiple: boolean,
  configuredTextVisible: boolean
) => {
  if (!scene || allowMultiple) return null;
  const managedIds = scene.sourceIds.filter((sourceId) => isPresentationTextSource(sources[sourceId]));
  if (configuredTextVisible) return new Set<string>();
  return new Set(managedIds.slice(-1));
};
