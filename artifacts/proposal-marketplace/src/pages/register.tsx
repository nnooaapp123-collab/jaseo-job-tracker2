import { useState } from "react";
import { Link, useLocation } from "wouter";
import { usePmRegister } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/PmAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";

export default function Register() {
  const [, navigate] = useLocation();
  const { refetch } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "buyer",
  });

  const registerMutation = usePmRegister();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate(
      { data: { name: form.name, email: form.email, password: form.password, role: form.role } },
      {
        onSuccess: (user) => {
          refetch();
          toast({ title: "Berhasil daftar!", description: `Selamat datang, ${user.name}` });
          if (user.role === "seller") navigate("/seller/dashboard");
          else navigate("/browse");
        },
        onError: () => {
          toast({ title: "Gagal mendaftar", description: "Email mungkin sudah digunakan.", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/">
            <span className="text-2xl font-bold text-primary cursor-pointer">ProposalHub</span>
          </Link>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Buat Akun Baru</CardTitle>
            <CardDescription>Bergabung dengan ProposalHub</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="name">Nama Lengkap</Label>
                <Input
                  id="name"
                  placeholder="Nama Anda"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
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
                  placeholder="Minimal 8 karakter"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label>Daftar Sebagai</Label>
                <RadioGroup
                  value={form.role}
                  onValueChange={(val) => setForm({ ...form, role: val })}
                  className="grid grid-cols-2 gap-3"
                >
                  <div className={`flex items-center gap-2 border rounded-lg p-3 cursor-pointer transition-colors ${form.role === "buyer" ? "border-primary bg-primary/5" : "border-border"}`}>
                    <RadioGroupItem value="buyer" id="buyer" />
                    <Label htmlFor="buyer" className="cursor-pointer">
                      <div className="font-medium text-sm">Pembeli</div>
                      <div className="text-xs text-muted-foreground">Beli proposal</div>
                    </Label>
                  </div>
                  <div className={`flex items-center gap-2 border rounded-lg p-3 cursor-pointer transition-colors ${form.role === "seller" ? "border-primary bg-primary/5" : "border-border"}`}>
                    <RadioGroupItem value="seller" id="seller" />
                    <Label htmlFor="seller" className="cursor-pointer">
                      <div className="font-medium text-sm">Penjual</div>
                      <div className="text-xs text-muted-foreground">Jual proposal</div>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={registerMutation.isPending}
              >
                {registerMutation.isPending ? "Mendaftar..." : "Daftar Sekarang"}
              </Button>
            </form>
            <p className="text-sm text-center text-muted-foreground mt-4">
              Sudah punya akun?{" "}
              <Link href="/login">
                <span className="text-primary font-medium cursor-pointer hover:underline">Masuk</span>
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
