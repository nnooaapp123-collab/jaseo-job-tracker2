import { useState } from "react";
import { Link, useLocation } from "wouter";
import { usePmLogin } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/PmAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [, navigate] = useLocation();
  const { refetch } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({ email: "", password: "" });

  const loginMutation = usePmLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(
      { data: { email: form.email, password: form.password } },
      {
        onSuccess: (user) => {
          refetch();
          if (user.role === "seller") navigate("/seller/dashboard");
          else if (user.role === "admin") navigate("/admin");
          else navigate("/browse");
        },
        onError: () => {
          toast({ title: "Gagal masuk", description: "Email atau password salah.", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/">
            <span className="text-2xl font-bold text-primary cursor-pointer">ProposalHub</span>
          </Link>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Masuk ke Akun</CardTitle>
            <CardDescription>Gunakan email dan password Anda</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="nama@email.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Password Anda"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Memproses..." : "Masuk"}
              </Button>
            </form>
            <p className="text-sm text-center text-muted-foreground mt-4">
              Belum punya akun?{" "}
              <Link href="/register">
                <span className="text-primary font-medium cursor-pointer hover:underline">Daftar</span>
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
