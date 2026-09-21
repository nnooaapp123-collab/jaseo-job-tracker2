import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/contexts/PmAuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useListPmUsers, getListPmUsersQueryKey } from "@workspace/api-client-react";

const ROLE_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  admin: { label: "Admin", variant: "destructive" },
  seller: { label: "Seller", variant: "default" },
  buyer: { label: "Pembeli", variant: "secondary" },
};

export default function AdminUsers() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { data: users, isLoading } = useListPmUsers({
    query: { enabled: !!user && user.role === "admin", queryKey: getListPmUsersQueryKey() },
  });

  if (authLoading) return <Layout><div className="p-8 text-center text-muted-foreground">Memuat...</div></Layout>;
  if (!user || user.role !== "admin") {
    navigate("/login");
    return null;
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Kelola Pengguna</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isLoading ? "Memuat..." : `${users?.length ?? 0} pengguna terdaftar`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : users?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Belum ada pengguna.</p>
            ) : (
              <div className="divide-y text-sm">
                {users?.map((u) => {
                  const roleInfo = ROLE_LABELS[u.role] ?? { label: u.role, variant: "secondary" as const };
                  return (
                    <div key={u.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                        {u.bankAccount && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {u.bankName} &middot; {u.bankAccount} ({u.accountOwner})
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {new Date(u.createdAt).toLocaleDateString("id-ID")}
                        </span>
                        <Badge variant={roleInfo.variant}>{roleInfo.label}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
