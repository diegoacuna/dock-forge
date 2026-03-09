"use client";

import Link from "next/link";
import { CreateGroupForm } from "../../../components/forms";
import { Button, PageHeader } from "../../../components/ui";

export default function NewGroupPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Create Group"
        description="Define a new orchestration group for related containers, shared operational context, and dependency-aware startup order."
        actions={
          <Link href="/groups">
            <Button variant="ghost">Back to Groups</Button>
          </Link>
        }
      />
      <CreateGroupForm />
    </div>
  );
}
