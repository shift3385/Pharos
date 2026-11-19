import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@shared/ui/Toast";
import { useConfirm } from "@shared/ui/useConfirm";
import { libraryApi } from "../api/libraryApi";
import { libraryErrorMessage } from "../model/errors";
import { impactSummary } from "../model/caseRefs";
import type {
  LibraryImpact,
  LibraryInput,
  LibraryItem,
  LibraryKind,
} from "../model/types";
import { ImpactDialog } from "./ImpactDialog";

export interface ItemContent {
  name: string;
  description: string;
}

/** What both editors (shared step, dataset) share: loading the item, saving
 *  it (a content change of an item in use first shows the impact notice,
 *  boceto 3), marking it obsolete, deleting it, and leaving with unsaved
 *  changes. `content` is the form; `toInput` and `contentKey` read it. */
export function useItemEditor<C extends ItemContent>({
  projectId,
  itemId,
  kind,
  userId,
  empty,
  fromItem,
  toBody,
  contentKey,
  onSaved,
  onClose,
}: {
  projectId: string;
  itemId: string | null;
  kind: LibraryKind;
  userId: string;
  empty: () => C;
  fromItem: (item: LibraryItem) => C;
  /** `definition` and `body` of the input. */
  toBody: (content: C) => { definition: unknown; body: unknown };
  /** The canonical content (name + definition + body): a change of it makes
   *  a new version and rewrites the following cases. */
  contentKey: (content: C) => string;
  onSaved: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [content, setContent] = useState<C>(empty);
  const [snapshot, setSnapshot] = useState(() => JSON.stringify(empty()));
  const [loading, setLoading] = useState(itemId !== null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [impact, setImpact] = useState<LibraryImpact | null>(null);
  const [attempt, setAttempt] = useState(0);
  const fromItemRef = useRef(fromItem);
  fromItemRef.current = fromItem;

  const show = (found: LibraryItem) => {
    const c = fromItemRef.current(found);
    setItem(found);
    setContent(c);
    setSnapshot(JSON.stringify(c));
  };

  useEffect(() => {
    if (!itemId) return;
    let live = true;
    setLoading(true);
    libraryApi
      .get(itemId, userId)
      .then((found) => {
        if (!live) return;
        const c = fromItemRef.current(found);
        setItem(found);
        setContent(c);
        setSnapshot(JSON.stringify(c));
        setFailed(false);
        setLoading(false);
      })
      .catch(() => {
        if (!live) return;
        setFailed(true);
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [itemId, userId, attempt]);

  const dirty = JSON.stringify(content) !== snapshot;

  const input = (c: C): LibraryInput => ({
    projectId,
    kind,
    name: c.name.trim(),
    description: c.description.trim() ? c.description : null,
    ...toBody(c),
    userId,
  });

  async function update(c: C) {
    if (!item) return;
    setSaving(true);
    try {
      const saved = await libraryApi.update(item.id, input(c));
      setImpact(null);
      show(saved.item);
      const n = saved.updatedCases.length;
      toast(
        n > 0
          ? t("library.toast.updatedCases", {
              count: n,
              version: saved.item.version,
            })
          : t("library.toast.saved", { version: saved.item.version }),
      );
    } catch (e) {
      toast(libraryErrorMessage(e, t), "error");
    } finally {
      setSaving(false);
    }
  }

  /** Creates, or saves a change; a content change with following cases asks
   *  first with the impact notice. */
  async function save() {
    if (!item) {
      setSaving(true);
      try {
        const created = await libraryApi.create(input(content));
        show(created);
        toast(t("library.toast.created", { name: created.name }));
        onSaved(created.id);
      } catch (e) {
        toast(libraryErrorMessage(e, t), "error");
      } finally {
        setSaving(false);
      }
      return;
    }
    const changed =
      contentKey(content) !== contentKey(fromItemRef.current(item));
    if (changed && item.usedBy > 0) {
      try {
        const found = await libraryApi.impact(item.id, userId);
        if (impactSummary(found).total > 0) {
          setImpact(found);
          return;
        }
      } catch (e) {
        toast(libraryErrorMessage(e, t), "error");
        return;
      }
    }
    await update(content);
  }

  async function toggleStatus() {
    if (!item) return;
    try {
      const next = await libraryApi.setStatus(
        item,
        item.status === "obsolete" ? "active" : "obsolete",
        userId,
      );
      setItem(next);
      toast(
        next.status === "obsolete"
          ? t("library.toast.obsolete")
          : t("library.toast.reactivated"),
      );
    } catch (e) {
      toast(libraryErrorMessage(e, t), "error");
    }
  }

  async function remove() {
    if (!item) return;
    const ok = await confirm({
      title: t("library.delete.title", { name: item.name }),
      message: t("library.delete.message"),
      confirmLabel: t("library.delete.confirm"),
      danger: true,
    });
    if (!ok) return;
    try {
      await libraryApi.remove(item.id, userId);
      toast(t("library.toast.deleted", { name: item.name }));
      onClose();
    } catch (e) {
      toast(libraryErrorMessage(e, t), "error");
    }
  }

  async function back() {
    if (dirty) {
      const ok = await confirm({
        title: t("library.discard.title"),
        message: t("common.discardConfirm"),
        confirmLabel: t("library.discard.confirm"),
        danger: true,
      });
      if (!ok) return;
    }
    onClose();
  }

  const impactDialog: ReactNode =
    impact && item ? (
      <ImpactDialog
        name={content.name.trim() || item.name}
        nextVersion={item.version + 1}
        impact={impact}
        saving={saving}
        onCancel={() => setImpact(null)}
        onConfirm={() => void update(content)}
      />
    ) : null;

  return {
    item,
    content,
    setContent,
    loading,
    failed,
    retry: () => {
      setFailed(false);
      setAttempt((n) => n + 1);
    },
    dirty,
    saving,
    save,
    toggleStatus,
    remove,
    back,
    dialogs: (
      <>
        {confirmDialog}
        {impactDialog}
      </>
    ),
  };
}
