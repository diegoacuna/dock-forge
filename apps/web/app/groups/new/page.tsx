"use client";

import { Suspense } from "react";
import Link from "next/link";
import { CreateGroupForm } from "@/components/forms";
import { Button, PageHeader } from "@/components/ui";

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
      <Suspense fallback={<div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading form...</div>}>
        <CreateGroupForm />
      </Suspense>
    </div>
  );
}
