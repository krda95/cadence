import { Component } from '@angular/core';

@Component({
  selector: 'app-about-experience',
  templateUrl: './experience.html',
  styleUrl: './experience.scss',
})
export class Experience {
  readonly experience = [
    {
      period: '2026 - Present',
      company: 'Blaze Tech.',
      role: 'Product Manager',
      description:
        'Building AI-powered products in healthcare SaaS, connecting product strategy with modern technologies and user needs.',
      highlights: [
        'LLM-powered AI assistant',
        'Passkey authentication and SSO',
        'API & Webhook integrations',
      ],
    },
    {
      period: '2021 - 2025',
      company: 'FARA AS',
      role: 'Product Owner',
      description:
        'Led the development of data analytics products for public transport operators, translating complex business needs into real solutions.',
      highlights: ['Product roadmap', 'Data analysis', 'Cross-functional team collaboration'],
    },
    {
      period: '2020 - 2021',
      company: 'FARA AS',
      role: 'Data Software Engineer',
      description:
        'Developed full-stack functionality and data processing solutions, building a strong technical foundation for product leadership.',
      highlights: ['Full-stack development', 'Data engineering'],
    },
    {
      period: '2018 - 2019',
      company: 'FIS',
      role: 'Technology Business Consultant',
      description:
        'Worked on enterprise technology solutions and automation of system monitoring processes.',
      highlights: ['Enterprise systems', 'Automation', 'Technical consulting'],
    },
  ];
}
