/** AI Classifier block — classify text using an LLM. */
import { AgentIcon } from '../../components/icons'
import { getModelOptions, getDefaultModel } from '../utils'

export const AiClassifierBlock = {
  type: 'ai_classifier',
  name: 'AI Classifier',
  description: 'Classify text into categories using an LLM',
  longDescription:
    'Uses an LLM to classify input text into one of several defined categories. The model returns the best matching category along with a confidence score. Ideal for intent detection, sentiment analysis, and content tagging.',
  category: 'blocks',
  bgColor: '#8B5CF6',
  icon: AgentIcon,
  subBlocks: [
    {
      id: 'categories',
      title: 'Categories',
      type: 'long-input',
      placeholder: 'positive, negative, neutral',
      required: true,
    },
    { id: 'text', title: 'Input Text', type: 'long-input', placeholder: 'Text to classify', required: true },
    {
      id: 'instructions',
      title: 'Classification Instructions',
      type: 'long-input',
      placeholder: 'Additional context for classification...',
    },
    {
      id: 'model',
      title: 'Model',
      type: 'combobox',
      options: getModelOptions,
      get defaultValue() { return getDefaultModel() },
      mode: 'advanced',
    },
    {
      id: 'outputFormat',
      title: 'Output',
      type: 'dropdown',
      options: [
        { label: 'Category only', id: 'category' },
        { label: 'Category + confidence', id: 'full' },
      ],
      mode: 'advanced',
    },
  ],
  tools: { access: ['ai'] },
  inputs: {
    text: { type: 'string', description: 'Text to classify' },
    categories: { type: 'string', description: 'Comma-separated categories' },
    instructions: { type: 'string', description: 'Classification instructions' },
  },
  outputs: {
    category: { type: 'string', description: 'Best matching category' },
    confidence: { type: 'number', description: 'Confidence score (0-1)' },
    allScores: { type: 'json', description: 'Scores for all categories' },
  },
}
