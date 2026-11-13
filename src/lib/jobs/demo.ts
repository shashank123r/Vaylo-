// Public, clearly-labeled DEMO job listings. These are sample data for browsing
// without an account. They are NOT real listings and never reference real users.
// When a visitor saves or applies, the chosen demo job is copied into their own
// account as an editable Job row.

export interface DemoJob {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  source: "greenhouse" | "lever" | "ashby" | "manual";
  tags: string[];
  postedLabel: string;
  summary: string;
  description: string;
  demo: true;
}

export const DEMO_JOBS: DemoJob[] = [
  {
    id: "demo-ml-infra",
    title: "Machine Learning Engineer, Inference",
    company: "Northwind Labs (demo)",
    location: "Remote, US",
    remote: true,
    source: "greenhouse",
    tags: ["PyTorch", "ONNX", "Inference", "Python"],
    postedLabel: "Sample listing",
    summary: "Own model serving and latency for a production inference platform.",
    description:
      "This is a demo listing used to showcase JobFlow. The role focuses on taking trained models to production: optimizing inference latency, quantization, batching, and GPU utilization. You will own the serving path end to end and work closely with research. Requirements: strong Python, experience with ONNX or TensorRT, and comfort profiling and optimizing real workloads.",
    demo: true,
  },
  {
    id: "demo-genai-eng",
    title: "Generative AI Engineer",
    company: "Clearwater AI (demo)",
    location: "Hybrid, Bengaluru",
    remote: false,
    source: "lever",
    tags: ["LLM", "RAG", "Agents", "TypeScript"],
    postedLabel: "Sample listing",
    summary: "Build retrieval-augmented and agentic LLM features for enterprise users.",
    description:
      "Demo listing. Build and ship LLM-powered product features: retrieval-augmented generation, tool-using agents, evaluation harnesses, and prompt iteration. You will care about correctness, latency, and cost. Requirements: experience integrating LLM APIs, building RAG pipelines, and writing production TypeScript or Python.",
    demo: true,
  },
  {
    id: "demo-cv-eng",
    title: "Computer Vision Engineer",
    company: "Terrapin Robotics (demo)",
    location: "On-site, Hyderabad",
    remote: false,
    source: "ashby",
    tags: ["Computer Vision", "LiDAR", "Edge", "C++"],
    postedLabel: "Sample listing",
    summary: "Perception and on-device vision for autonomous systems.",
    description:
      "Demo listing. Work on perception models for robotics: detection, segmentation, and LiDAR processing, deployed on edge hardware. Requirements: solid computer vision fundamentals, experience with on-device deployment, and strong C++ or Python.",
    demo: true,
  },
  {
    id: "demo-platform-eng",
    title: "AI Platform Engineer",
    company: "Beacon Systems (demo)",
    location: "Remote, EU",
    remote: true,
    source: "greenhouse",
    tags: ["Backend", "Docker", "PostgreSQL", "Reliability"],
    postedLabel: "Sample listing",
    summary: "Backend and infrastructure for AI products at scale.",
    description:
      "Demo listing. Build the backend and infrastructure behind AI products: async services, caching, deployment, observability, and reliability. Requirements: strong backend engineering, databases, containerization, and a reliability mindset.",
    demo: true,
  },
];

export function getDemoJob(id: string): DemoJob | undefined {
  return DEMO_JOBS.find((j) => j.id === id);
}

export interface DemoJobFilter {
  q?: string;
  remote?: boolean;
  source?: string;
}

export function filterDemoJobs(filter: DemoJobFilter): DemoJob[] {
  const q = filter.q?.trim().toLowerCase();
  return DEMO_JOBS.filter((j) => {
    if (filter.remote !== undefined && j.remote !== filter.remote) return false;
    if (filter.source && j.source !== filter.source) return false;
    if (q) {
      const hay = `${j.title} ${j.company} ${j.location} ${j.tags.join(" ")} ${j.summary}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
