"use client";

import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, RotateCw, Upload } from "lucide-react";
import type { ProspectAssetType } from "@bespoke/shared";
import {
  useAddProspectAsset,
  useProspect,
  useRetryProspectAsset,
  useUpdateProspect,
  type UpdateProspectInput,
} from "@/lib/hooks/use-prospects";
import {
  uploadToCloudinary,
  useCloudinarySignature,
} from "@/lib/hooks/use-uploads";
import { GenerationPanel } from "@/components/prospects/generation-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/status-badge";

const URL_ASSET_TYPES: { value: ProspectAssetType; label: string }[] = [
  { value: "github", label: "GitHub" },
  { value: "personal_site", label: "Personal site" },
  { value: "company_site", label: "Company site" },
  { value: "other_url", label: "Other URL" },
];

export default function ProspectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const prospect = useProspect(id);
  const updateProspect = useUpdateProspect(id);
  const addAsset = useAddProspectAsset(id);
  const retryAsset = useRetryProspectAsset(id);
  const signature = useCloudinarySignature();

  const [fields, setFields] = useState<UpdateProspectInput>({});
  const [assetType, setAssetType] = useState<ProspectAssetType>("github");
  const [assetUrl, setAssetUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (prospect.data) {
      setFields({
        name: prospect.data.name,
        email: prospect.data.email ?? "",
        jobTitle: prospect.data.jobTitle ?? "",
        companyName: prospect.data.companyName ?? "",
        notes: prospect.data.notes ?? "",
      });
    }
  }, [prospect.data]);

  function setField(key: keyof UpdateProspectInput, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateProspect.mutate(fields);
  }

  function handleAddUrlAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assetUrl.trim()) return;
    addAsset.mutate(
      { assetType, url: assetUrl.trim() },
      { onSuccess: () => setAssetUrl("") },
    );
  }

  async function handleScreenshot(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const sig = await signature.mutateAsync(undefined);
      const { publicId } = await uploadToCloudinary(file, sig);
      await addAsset.mutateAsync({
        assetType: "linkedin_screenshot",
        fileKey: publicId,
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      <Link
        href="/dashboard/prospects"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Prospects
      </Link>

      {prospect.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : prospect.isError ? (
        <p className="text-sm text-[var(--state-error)]" role="alert">
          {prospect.error.message}
        </p>
      ) : !prospect.data ? (
        <p className="text-sm text-[var(--text-muted)]">Prospect not found.</p>
      ) : (
        <>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            {prospect.data.name}
          </h1>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-6">
              <form
                onSubmit={handleSave}
                className="flex flex-col gap-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-5"
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={fields.name ?? ""}
                    onChange={(e) => setField("name", e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="jobTitle">Job title</Label>
                    <Input
                      id="jobTitle"
                      value={fields.jobTitle ?? ""}
                      onChange={(e) => setField("jobTitle", e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="companyName">Company</Label>
                    <Input
                      id="companyName"
                      value={fields.companyName ?? ""}
                      onChange={(e) => setField("companyName", e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={fields.email ?? ""}
                    onChange={(e) => setField("email", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    rows={3}
                    value={fields.notes ?? ""}
                    onChange={(e) => setField("notes", e.target.value)}
                    className="resize-none"
                  />
                </div>
                <div>
                  <Button type="submit" disabled={updateProspect.isPending}>
                    {updateProspect.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    Save changes
                  </Button>
                </div>
              </form>

              <section className="flex flex-col gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-medium text-[var(--text-primary)]">
                    Research assets
                  </h2>
                  {prospect.data.scraping &&
                  prospect.data.assets.length > 0 ? (
                    <span className="flex items-center gap-1.5 text-xs text-[var(--accent-text)]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {
                        prospect.data.assets.filter(
                          (a) => a.status === "done" || a.status === "failed",
                        ).length
                      }
                      /{prospect.data.assets.length} processed
                    </span>
                  ) : null}
                </div>

                <form onSubmit={handleAddUrlAsset} className="flex flex-col gap-2 sm:flex-row">
                  <Select
                    value={assetType}
                    onValueChange={(v) => setAssetType(v as ProspectAssetType)}
                  >
                    <SelectTrigger className="sm:w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {URL_ASSET_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="url"
                    placeholder="https://…"
                    value={assetUrl}
                    onChange={(e) => setAssetUrl(e.target.value)}
                    className="flex-1"
                  />
                  <Button type="submit" disabled={addAsset.isPending || !assetUrl.trim()}>
                    Add
                  </Button>
                </form>

                <div>
                  <Label
                    htmlFor="screenshot"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-hover)]"
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Upload LinkedIn screenshot
                  </Label>
                  <input
                    id="screenshot"
                    type="file"
                    accept="image/*"
                    onChange={handleScreenshot}
                    disabled={uploading}
                    className="hidden"
                  />
                </div>

                {prospect.data.assets.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {prospect.data.assets.map((asset) => (
                      <li
                        key={asset.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-[var(--border-default)] px-3 py-2 text-xs"
                      >
                        <span className="flex min-w-0 items-center gap-1.5 truncate text-[var(--text-secondary)]">
                          {asset.status === "processing" ? (
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--state-warning)]" />
                          ) : asset.status === "pending" ? (
                            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--accent-primary)]" />
                          ) : null}
                          <span className="truncate">
                            {asset.assetType.replace(/_/g, " ")}
                            {asset.url ? ` · ${asset.url}` : ""}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {asset.status === "failed" &&
                          asset.retryCount < 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 gap-1 px-2 text-xs"
                              onClick={() => retryAsset.mutate(asset.id)}
                              disabled={retryAsset.isPending}
                            >
                              {retryAsset.isPending &&
                              retryAsset.variables === asset.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCw className="h-3 w-3" />
                              )}
                              Retry
                            </Button>
                          ) : null}
                          <StatusBadge status={asset.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[var(--text-muted)]">
                    No assets yet. Add a URL or screenshot to build context.
                  </p>
                )}
              </section>

              <section className="flex flex-col gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
                <h2 className="text-sm font-medium text-[var(--text-primary)]">
                  Consolidated context
                </h2>
                {prospect.data.mergedContext ? (
                  <pre className="whitespace-pre-wrap rounded-md bg-[var(--bg-base)] p-4 font-mono text-xs leading-relaxed text-[var(--text-secondary)]">
                    {prospect.data.mergedContext}
                  </pre>
                ) : prospect.data.scraping ? (
                  <p className="flex items-center gap-1.5 rounded-md bg-[var(--bg-base)] p-4 text-xs text-[var(--text-muted)]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Building context from the assets above…
                  </p>
                ) : (
                  <pre className="whitespace-pre-wrap rounded-md bg-[var(--bg-base)] p-4 font-mono text-xs leading-relaxed text-[var(--text-secondary)]">
                    Not built yet.
                  </pre>
                )}
              </section>
            </div>

            <GenerationPanel prospectId={id} />
          </div>
        </>
      )}
    </div>
  );
}
