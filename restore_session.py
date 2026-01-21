import os
import zipfile

structure = {
    "S": [
        "Learn Earn", "Productivity", "Outreach Playbook", "Motivation", "Flow",
        "The Grand Slam Offer", "Business Research", "Financial Urgent", "Work", "Finances"
    ],
    "A": [
        "Next-Level Acceleration", "Tech Projects", "Game Development", "Lead Generation",
        "Research", "Relationship", "Content Creation"
    ],
    "B": [
        "Website", "Domain Acquisition", "Podcasting", "BrandKit", "Productized Service",
        "Household & Maintenance", "Funnel & Tracking", "Health & Wellness", "Community Building",
        "Operations", "Personal Branding", "Reflection", "Personal Events", "Product Development"
    ],
    "C": [
        "Fitness", "Wellness", "Streaming Setup", "App Mafia", "Lightmark.ai",
        "Social Media", "Code", "Luma Event", "Dental & Medical", "SEO",
        "Indiehacking", "Design", "SelfCare", "Content Strategy"
    ],
    "D": [
        "Travel", "Content Curation", "Improv Setup", "Townhall"
    ],
    "F": [
        "None", "Shopping & Errands", "NS Projects & Social", "Content Consumption",
        "Leisure", "Ns"
    ]
}

zip_filename = "restored_flowlist.zip"

with zipfile.ZipFile(zip_filename, 'w') as zf:
    for tier, folders in structure.items():
        for folder in folders:
            # Create a dummy text file inside the tier folder
            # Path in zip: Tier/Folder.txt
            path = f"{tier}/{folder}.txt"
            zf.writestr(path, "- [ ] Placeholder task")

print(f"Created {zip_filename}")
