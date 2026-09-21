import { useState } from "react";
import Layout from "@/components/layout/Layout";
import ProposalCard from "@/components/ProposalCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useListPmProposals,
  useListPmCategories,
} from "@workspace/api-client-react";

export default function Browse() {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [minPrice, setMinPrice] = useState<number | undefined>();
  const [maxPrice, setMaxPrice] = useState<number | undefined>();

  const { data: categories } = useListPmCategories();
  const { data: proposals, isLoading } = useListPmProposals(
    {
      search: search || undefined,
      categoryId: categoryId,
      minPrice: minPrice,
      maxPrice: maxPrice,
    }
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const handleReset = () => {
    setSearch("");
    setSearchInput("");
    setCategoryId(undefined);
    setMinPrice(undefined);
    setMaxPrice(undefined);
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-4">Jelajahi Proposal</h1>
          <form onSubmit={handleSearch} className="flex gap-2 mb-4">
            <Input
              placeholder="Cari proposal..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="max-w-md"
            />
            <Button type="submit">Cari</Button>
          </form>
          <div className="flex flex-wrap gap-3 items-center">
            <Select
              value={categoryId?.toString() ?? "all"}
              onValueChange={(v) => setCategoryId(v === "all" ? undefined : Number(v))}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Semua Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kategori</SelectItem>
                {categories?.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id.toString()}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={minPrice !== undefined ? minPrice.toString() : "any"}
              onValueChange={(v) => setMinPrice(v === "any" ? undefined : Number(v))}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Harga Min" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Harga Min</SelectItem>
                <SelectItem value="0">Rp 0</SelectItem>
                <SelectItem value="50000">Rp 50.000</SelectItem>
                <SelectItem value="100000">Rp 100.000</SelectItem>
                <SelectItem value="250000">Rp 250.000</SelectItem>
                <SelectItem value="500000">Rp 500.000</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={maxPrice !== undefined ? maxPrice.toString() : "any"}
              onValueChange={(v) => setMaxPrice(v === "any" ? undefined : Number(v))}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Harga Max" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Harga Max</SelectItem>
                <SelectItem value="100000">Rp 100.000</SelectItem>
                <SelectItem value="250000">Rp 250.000</SelectItem>
                <SelectItem value="500000">Rp 500.000</SelectItem>
                <SelectItem value="1000000">Rp 1.000.000</SelectItem>
              </SelectContent>
            </Select>

            {(search || categoryId || minPrice || maxPrice) && (
              <Button variant="ghost" size="sm" onClick={handleReset}>
                Reset Filter
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
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
        ) : proposals?.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg mb-2">Tidak ada proposal ditemukan</p>
            <p className="text-sm">Coba ubah kata kunci atau filter pencarian</p>
            <Button variant="outline" className="mt-4" onClick={handleReset}>
              Tampilkan Semua
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              {proposals?.length} proposal ditemukan
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {proposals?.map((p) => (
                <ProposalCard key={p.id} proposal={p} />
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
