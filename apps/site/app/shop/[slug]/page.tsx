import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PRODUCTS } from "../../../src/data/products";
import { ProductDetailContent } from "./product-detail-content";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

export function generateStaticParams() {
  return PRODUCTS.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = PRODUCTS.find((p) => p.slug === slug);
  if (!product) return {};

  const url = `${SITE_URL}/shop/${product.slug}`;
  return {
    title: product.name.en,
    description: product.description.en,
    alternates: { canonical: url },
    openGraph: {
      title: `${product.name.en} | 9th Round Shop`,
      description: product.description.en,
      url,
      type: "website",
    },
  };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = PRODUCTS.find((p) => p.slug === slug);
  if (!product) notFound();

  return <ProductDetailContent product={product} />;
}
