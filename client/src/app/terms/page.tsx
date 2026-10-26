import type { Metadata } from "next";
import LegalPage, { legalContext } from "@/components/LegalPage";

export async function generateMetadata(): Promise<Metadata> {
  const { legal } = await legalContext();
  return { title: legal.termsTitle };
}

export default function TermsPage() {
  return <LegalPage kind="terms" />;
}
