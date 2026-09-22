import { useAuth } from "@/auth";
import { CommentThread } from "@/components/comment-thread";

// Client dashboard: their own project thread, nothing else.
export default function PortalPage() {
  const { profile } = useAuth(); // RoleLayout guarantees a client profile, which always has client_id

  return (
    <div className="mx-auto grid max-w-3xl gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{profile!.client?.name ?? "Your project"}</h1>
        <p className="text-sm text-muted-foreground">
          Post updates and questions here. The VMH team replies in this thread.
        </p>
      </div>
      <CommentThread clientId={profile!.client_id!} userId={profile!.id} />
    </div>
  );
}
