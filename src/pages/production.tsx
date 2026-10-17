import { 
  CheckCircle2, 
  ChevronRight, 
  Clock, 
  ExternalLink, 
  Film, 
  Filter, 
  Layers, 
  MoreVertical, 
  Plus, 
  Search, 
  Sparkles, 
  Trash2, 
  Video 
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export type ProductionStage = 
  | "concept" 
  | "production" 
  | "post_prod" 
  | "review" 
  | "client_review" 
  | "completed";

export type DeliverableType = 
  | "reel" 
  | "long_form" 
  | "ad_campaign" 
  | "motion_graphic" 
  | "brand_film";

export type Priority = "urgent" | "high" | "normal" | "low";

export type Deliverable = {
  id: string;
  title: string;
  clientId: string | null;
  clientName?: string;
  stage: ProductionStage;
  type: DeliverableType;
  priority: Priority;
  assignee: string;
  dueDate: string;
  assetUrl?: string;
  notes?: string;
  createdAt: string;
};

const STAGES: { id: ProductionStage; label: string; color: string; desc: string }[] = [
  { id: "concept", label: "Concept & Brief", color: "from-blue-500/20 to-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30", desc: "Scripting & pre-production" },
  { id: "production", label: "Production & Shoot", color: "from-amber-500/20 to-yellow-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30", desc: "Filming & raw assets" },
  { id: "post_prod", label: "Post-Production", color: "from-purple-500/20 to-pink-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30", desc: "Editing, color & sound" },
  { id: "review", label: "Internal QC", color: "from-indigo-500/20 to-blue-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30", desc: "Director & team review" },
  { id: "client_review", label: "Client Approval", color: "from-[#FF4B33]/20 to-orange-500/10 text-[#FF4B33] border-[#FF4B33]/40", desc: "Feedback & sign-off" },
  { id: "completed", label: "Delivered & Live", color: "from-emerald-500/20 to-teal-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30", desc: "Final render published" },
];

const INITIAL_DELIVERABLES: Deliverable[] = [
  {
    id: "del-1",
    title: "Brand Story 60s Anthem Cut",
    clientId: null,
    clientName: "Apex Athletics",
    stage: "post_prod",
    type: "brand_film",
    priority: "urgent",
    assignee: "Alex M.",
    dueDate: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
    assetUrl: "https://frame.io",
    notes: "Needs sound design pass and color grade match for the dusk scenes.",
    createdAt: new Date().toISOString(),
  },
  {
    id: "del-2",
    title: "Q4 Social Campaign - 5x Hook Reels",
    clientId: null,
    clientName: "Lumina Skincare",
    stage: "client_review",
    type: "reel",
    priority: "high",
    assignee: "Sarah K.",
    dueDate: new Date(Date.now() + 86400000 * 1).toISOString().slice(0, 10),
    assetUrl: "https://drive.google.com",
    notes: "Client sent notes on caption font sizes, exported v3.",
    createdAt: new Date().toISOString(),
  },
  {
    id: "del-3",
    title: "Product Launch Commercial 4K",
    clientId: null,
    clientName: "Velo Electric",
    stage: "production",
    type: "ad_campaign",
    priority: "high",
    assignee: "Jordan P.",
    dueDate: new Date(Date.now() + 86400000 * 5).toISOString().slice(0, 10),
    assetUrl: "",
    notes: "Studio shoot booked for Thursday 10 AM. Drone operator confirmed.",
    createdAt: new Date().toISOString(),
  },
  {
    id: "del-4",
    title: "Founder Interview & Behind-the-Scenes",
    clientId: null,
    clientName: "Apex Athletics",
    stage: "concept",
    type: "long_form",
    priority: "normal",
    assignee: "Alex M.",
    dueDate: new Date(Date.now() + 86400000 * 8).toISOString().slice(0, 10),
    notes: "Outline 5 talking points focusing on heritage and sustainable materials.",
    createdAt: new Date().toISOString(),
  },
  {
    id: "del-5",
    title: "Logo Reveal & Lower Thirds Package",
    clientId: null,
    clientName: "Vertex Internal",
    stage: "completed",
    type: "motion_graphic",
    priority: "low",
    assignee: "Team",
    dueDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    notes: "All 4K ProRes 4444 files exported with alpha channel.",
    createdAt: new Date().toISOString(),
  },
];

const STORAGE_KEY = "vmh_production_deliverables";

export default function ProductionPage() {
  const [deliverables, setDeliverables] = useState<Deliverable[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Failed to load local deliverables", e);
    }
    return INITIAL_DELIVERABLES;
  });

  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [filterClient, setFilterClient] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Deliverable | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formClient, setFormClient] = useState<string>("none");
  const [formStage, setFormStage] = useState<ProductionStage>("concept");
  const [formType, setFormType] = useState<DeliverableType>("reel");
  const [formPriority, setFormPriority] = useState<Priority>("normal");
  const [formAssignee, setFormAssignee] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [formAssetUrl, setFormAssetUrl] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deliverables));
  }, [deliverables]);

  // Load clients from Supabase
  useEffect(() => {
    supabase
      .from("clients")
      .select("id, name")
      .eq("archived", false)
      .order("name")
      .then(({ data }) => {
        if (data) setClients(data);
      });
  }, []);

  const openAddModal = () => {
    setEditingItem(null);
    setFormTitle("");
    setFormClient("none");
    setFormStage("concept");
    setFormType("reel");
    setFormPriority("normal");
    setFormAssignee("");
    setFormDueDate(new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10));
    setFormAssetUrl("");
    setFormNotes("");
    setIsAddOpen(true);
  };

  const openEditModal = (item: Deliverable) => {
    setEditingItem(item);
    setFormTitle(item.title);
    setFormClient(item.clientId || "none");
    setFormStage(item.stage);
    setFormType(item.type);
    setFormPriority(item.priority);
    setFormAssignee(item.assignee);
    setFormDueDate(item.dueDate);
    setFormAssetUrl(item.assetUrl || "");
    setFormNotes(item.notes || "");
    setIsAddOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      return toast.error("Please enter a deliverable title.");
    }

    const selectedClientObj = clients.find((c) => c.id === formClient);
    const clientName = selectedClientObj ? selectedClientObj.name : formClient !== "none" ? formClient : "Internal";

    if (editingItem) {
      setDeliverables((prev) =>
        prev.map((item) =>
          item.id === editingItem.id
            ? {
                ...item,
                title: formTitle.trim(),
                clientId: formClient === "none" ? null : formClient,
                clientName,
                stage: formStage,
                type: formType,
                priority: formPriority,
                assignee: formAssignee.trim() || "Unassigned",
                dueDate: formDueDate,
                assetUrl: formAssetUrl.trim() || undefined,
                notes: formNotes.trim() || undefined,
              }
            : item,
        ),
      );
      toast.success("Deliverable updated");
    } else {
      const newItem: Deliverable = {
        id: `del-${Date.now()}`,
        title: formTitle.trim(),
        clientId: formClient === "none" ? null : formClient,
        clientName,
        stage: formStage,
        type: formType,
        priority: formPriority,
        assignee: formAssignee.trim() || "Unassigned",
        dueDate: formDueDate || new Date().toISOString().slice(0, 10),
        assetUrl: formAssetUrl.trim() || undefined,
        notes: formNotes.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      setDeliverables((prev) => [newItem, ...prev]);
      toast.success("Deliverable created");
    }

    setIsAddOpen(false);
  };

  const advanceStage = (id: string) => {
    setDeliverables((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const currentIndex = STAGES.findIndex((s) => s.id === item.stage);
        const nextStage = STAGES[Math.min(STAGES.length - 1, currentIndex + 1)].id;
        return { ...item, stage: nextStage };
      }),
    );
    toast.success("Advanced to next stage");
  };

  const deleteItem = (id: string) => {
    setDeliverables((prev) => prev.filter((item) => item.id !== id));
    toast.success("Deliverable deleted");
  };

  const filteredItems = useMemo(() => {
    return deliverables.filter((item) => {
      const matchClient =
        filterClient === "all" ||
        item.clientId === filterClient ||
        item.clientName?.toLowerCase().includes(filterClient.toLowerCase());
      const matchSearch =
        !searchQuery ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.clientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.assignee.toLowerCase().includes(searchQuery.toLowerCase());
      return matchClient && matchSearch;
    });
  }, [deliverables, filterClient, searchQuery]);

  const priorityStyles: Record<Priority, { label: string; badge: string }> = {
    urgent: { label: "Urgent", badge: "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 font-semibold" },
    high: { label: "High", badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30" },
    normal: { label: "Normal", badge: "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border border-neutral-500/20" },
    low: { label: "Low", badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20" },
  };

  const typeLabels: Record<DeliverableType, string> = {
    reel: "Reel / TikTok",
    long_form: "Long-Form Video",
    ad_campaign: "Ad Campaign",
    motion_graphic: "Motion Graphics",
    brand_film: "Brand Film",
  };

  return (
    <div className="grid gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-[#FF4B33]/15 text-[#FF4B33]">
              <Film className="size-4" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Production Pipeline</h1>
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              {deliverables.length} in flight
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Track video deliverables, edits, reels and client approvals from concept to launch.
          </p>
        </div>

        <Button onClick={openAddModal} className="brand-gradient font-medium text-white shadow-md hover:opacity-90">
          <Plus className="mr-1.5 size-4" /> Add Deliverable
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/60 p-3 shadow-sm backdrop-blur-md sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search deliverables, clients, editors…"
            className="pl-9 bg-background/50 border-border/50 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground shrink-0 hidden sm:inline" />
          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="w-full sm:w-48 bg-background/50 text-xs">
              <SelectValue placeholder="All Clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Production Stage Columns (Kanban Board) */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {STAGES.map((stage) => {
          const itemsInStage = filteredItems.filter((item) => item.stage === stage.id);
          return (
            <div
              key={stage.id}
              className="flex flex-col rounded-2xl border border-border/60 bg-card/40 p-3 shadow-sm"
            >
              {/* Column Header */}
              <div className="mb-3 flex items-center justify-between border-b border-border/40 pb-2">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    {stage.label}
                  </h3>
                  <p className="text-[10px] text-muted-foreground">{stage.desc}</p>
                </div>
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-[11px] font-bold border",
                    stage.color,
                  )}
                >
                  {itemsInStage.length}
                </span>
              </div>

              {/* Cards List */}
              <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto min-h-32">
                {itemsInStage.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border/40 p-4 text-center">
                    <p className="text-xs text-muted-foreground/60">No items</p>
                  </div>
                ) : (
                  itemsInStage.map((item) => (
                    <div
                      key={item.id}
                      className="group relative flex flex-col justify-between rounded-xl border border-border/70 bg-card p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md"
                    >
                      <div>
                        {/* Tags Header */}
                        <div className="mb-2 flex items-center justify-between gap-1">
                          <span className="truncate rounded-md bg-accent/70 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                            {item.clientName || "VMH Internal"}
                          </span>
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide",
                              priorityStyles[item.priority].badge,
                            )}
                          >
                            {priorityStyles[item.priority].label}
                          </span>
                        </div>

                        {/* Title */}
                        <h4
                          onClick={() => openEditModal(item)}
                          className="cursor-pointer text-sm font-semibold leading-tight text-foreground transition-colors hover:text-[#FF4B33]"
                        >
                          {item.title}
                        </h4>

                        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Video className="size-3 text-[#FF4B33]" />
                          <span>{typeLabels[item.type]}</span>
                        </div>

                        {item.notes && (
                          <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground/80">
                            {item.notes}
                          </p>
                        )}
                      </div>

                      {/* Card Footer */}
                      <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-xs">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="size-3" />
                          <span className="text-[10px] font-medium">{item.dueDate}</span>
                        </div>

                        <div className="flex items-center gap-1">
                          {item.assetUrl && (
                            <a
                              href={item.assetUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                              title="Open Asset Link"
                            >
                              <ExternalLink className="size-3.5" />
                            </a>
                          )}

                          {stage.id !== "completed" && (
                            <button
                              onClick={() => advanceStage(item.id)}
                              className="flex size-6 items-center justify-center rounded-full bg-accent/70 text-foreground transition-colors hover:bg-[#FF4B33] hover:text-white"
                              title="Advance to next stage"
                            >
                              <ChevronRight className="size-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => deleteItem(item.id)}
                            className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                            title="Delete"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Deliverable Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-lg rounded-2xl">
          <form onSubmit={handleSave} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>
                {editingItem ? "Edit Deliverable" : "New Production Deliverable"}
              </DialogTitle>
              <DialogDescription>
                Assign assets, deadlines, and stages to keep production running on time.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="title" className="text-xs">
                  Deliverable Title *
                </Label>
                <Input
                  id="title"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. 60s Brand Film Launch Reel"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Client</Label>
                  <Select value={formClient} onValueChange={setFormClient}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">VMH Internal</SelectItem>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label className="text-xs">Format / Type</Label>
                  <Select
                    value={formType}
                    onValueChange={(v) => setFormType(v as DeliverableType)}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reel">Reel / Short (9:16)</SelectItem>
                      <SelectItem value="long_form">Long-Form Video (16:9)</SelectItem>
                      <SelectItem value="ad_campaign">Paid Ad Campaign</SelectItem>
                      <SelectItem value="motion_graphic">Motion Graphics / 3D</SelectItem>
                      <SelectItem value="brand_film">Cinema / Brand Film</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Current Stage</Label>
                  <Select
                    value={formStage}
                    onValueChange={(v) => setFormStage(v as ProductionStage)}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGES.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label className="text-xs">Priority</Label>
                  <Select
                    value={formPriority}
                    onValueChange={(v) => setFormPriority(v as Priority)}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="assignee" className="text-xs">
                    Assignee / Lead
                  </Label>
                  <Input
                    id="assignee"
                    value={formAssignee}
                    onChange={(e) => setFormAssignee(e.target.value)}
                    placeholder="e.g. Alex (Editor)"
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="dueDate" className="text-xs">
                    Target Delivery Date
                  </Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="assetUrl" className="text-xs">
                  Asset or Review Link (Frame.io, Drive, Figma)
                </Label>
                <Input
                  id="assetUrl"
                  type="url"
                  value={formAssetUrl}
                  onChange={(e) => setFormAssetUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="notes" className="text-xs">
                  Production Notes & Specs
                </Label>
                <Textarea
                  id="notes"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Audio stems needed, 4K 24fps, color notes..."
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsAddOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="brand-gradient text-white">
                {editingItem ? "Save Changes" : "Create Deliverable"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
