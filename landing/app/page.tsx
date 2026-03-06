import Hero from "@/components/hero";
import CoreValues from "@/components/core-values";
import HowItWorks from "@/components/how-it-works";
import DownloadSection from "@/components/download-section";
import BypassGuide from "@/components/bypass-guide";
import Footer from "@/components/footer";

export default function Home() {
  return (
    <main>
      <Hero />
      <CoreValues />
      <HowItWorks />
      <DownloadSection />
      <BypassGuide />
      <Footer />
    </main>
  );
}
