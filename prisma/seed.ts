import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Development seed. Creates ONE clearly-labeled demo account so you can sign in
// and exercise profile -> tailor -> tracker without manual setup. Never run this
// against a production database.
const db = new PrismaClient();

async function main() {
  const email = "demo@jobflow.local";
  const passwordHash = await bcrypt.hash("demo-password", 12);

  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Demo User",
      passwordHash,
      profile: {
        create: {
          headline: "Machine Learning Engineer",
          location: "Remote",
          summary: "Demo profile for local development. Replace with your own details.",
          targetTitles: ["ML Engineer", "GenAI Engineer"],
          onboardingDone: true,
          skills: {
            create: [
              { name: "Python" },
              { name: "PyTorch" },
              { name: "ONNX" },
              { name: "FastAPI" },
            ],
          },
          experience: {
            create: [
              {
                company: "Example Corp (demo)",
                title: "ML Engineer",
                startDate: "2024",
                current: true,
                order: 0,
                highlights: [
                  "Shipped model-serving improvements (demo highlight).",
                  "Built evaluation tooling (demo highlight).",
                ],
              },
            ],
          },
          education: {
            create: [{ school: "Demo University", degree: "B.Tech", field: "AI & DS", order: 0 }],
          },
        },
      },
    },
  });

  console.log(`Seeded demo account: ${user.email} / demo-password`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
