import { Link } from "wouter";
import Layout from "@/components/layout/Layout";
import ProposalCard from "@/components/ProposalCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useListPmProposals,
  useListPmCategories,
} from "@workspace/api-client-react";

export default function Home() {
  const { data: proposals, isLoading } = useListPmProposals();
  const { data: categories } = useListPmCategories();

  const featured = proposals?.slice(0, 6) ?? [];

  return (
    <Layout>
      <section className="bg-gradient-to-br from-primary to-primary/80 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
            Marketplace Proposal Bisnis
            <br />
            <span className="text-white/80">Terpercaya Indonesia</span>
          </h1>
          <p className="text-lg text-white/80 mb-8 max-w-2xl mx-auto">
            Temukan dan beli proposal bisnis berkualitas. Seller profesional,
            dokumen siap pakai, harga terjangkau.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/browse">
              <Button size="lg" variant="secondary" className="text-base font-semibold px-8">
                Jelajahi Proposal
              </Button>
            </Link>
            <Link href="/register">
              <Button
                size="lg"
                variant="outline"
                className="text-base font-semibold px-8 border-white text-white hover:bg-white hover:text-primary"
              >
                Jadi Seller
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-12 bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { label: "Seller Aktif", value: "100+" },
              { label: "Proposal Tersedia", value: "500+" },
              { label: "Transaksi Selesai", value: "1.200+" },
              { label: "Kepuasan Pembeli", value: "98%" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-2xl font-bold text-primary">{stat.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {categories && categories.length > 0 && (
        <section className="py-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-xl font-bold mb-6">Kategori Proposal</h2>
            <div className="flex flex-wrap gap-3">
              {categories.map((cat) => (
                <Link key={cat.id} href={`/browse?categoryId=${cat.id}`}>
                  <Button variant="outline" className="rounded-full">
                    {cat.name}
                  </Button>
                </Link>
              ))}
              <Link href="/browse">
                <Button variant="outline" className="rounded-full">
                  Lihat Semua
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="py-10 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">Proposal Terbaru</h2>
            <Link href="/browse">
              <Button variant="ghost" size="sm">Lihat Semua</Button>
            </Link>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-lg overflow-hidden border">
                  <Skeleton className="aspect-video w-full" />
                  <div className="p-4 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-5 w-1/3 mt-2" />
                  </div>
                </div>
              ))}
            </div>
          ) : featured.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-lg">Belum ada proposal tersedia.</p>
              <Link href="/register">
                <Button className="mt-4">Jadilah yang Pertama Berjualan</Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featured.map((p) => (
                <ProposalCard key={p.id} proposal={p} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="py-16 bg-white border-t">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-center mb-10">Cara Kerja</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Daftar & Pilih Peran",
                desc: "Daftar sebagai pembeli untuk membeli proposal, atau seller untuk menjual proposal Anda.",
              },
              {
                step: "2",
                title: "Temukan & Beli",
                desc: "Jelajahi ratusan proposal bisnis. Pilih yang sesuai kebutuhan, lakukan pembayaran.",
              },
              {
                step: "3",
                title: "Unduh Dokumen",
                desc: "Setelah pembayaran dikonfirmasi, unduh dokumen proposal langsung dari platform.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center text-lg font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}
