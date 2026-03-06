import Hero from "@/components/hero";
import CoreValues from "@/components/core-values";
import HowItWorks from "@/components/how-it-works";
import SyncOptions from "@/components/sync-options";
import DownloadSection from "@/components/download-section";
import BypassGuide from "@/components/bypass-guide";
import Footer from "@/components/footer";

export default function Home() {
  return (
    <main>
      <Hero />
      <CoreValues />
      <HowItWorks />
      <SyncOptions />
      <DownloadSection />
      <BypassGuide />
      <Footer />
    </main>
  );
}
