import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Box,
  Title,
  TextInput,
  Textarea,
  Select,
  Button,
  Center,
  Loader,
  Text,
  Card,
  Stack,
  Group,
  ActionIcon,
  Modal,
  SimpleGrid,
} from "@mantine/core";
import { IconPlus, IconTrash, IconEdit, IconCopy } from "@tabler/icons-react";
import { apiGet, apiPost, apiPut, apiDelete } from "../api";
import { summarizePollResults } from "../aiApi";
import { PresentMDPreview } from "../presentMDRenderer";
import { QRCodeSVG } from "qrcode.react";

/**
 * HostEdit - Presenter's editing page
 *
 * Allows the presenter to:
 * - Edit presentation details and status
 * - Create, edit, and delete slides
 * - Create and manage poll slides
 * - View attendees and their participation status
 * - View poll results with response counts and percentages
 * - Generate AI summaries of poll results
 * - Copy the presentation link and display its QR code
 *
 * @component
 * @returns {JSX.Element} The presentation editing page
 */

function HostEdit() {
  const { id } = useParams();
  // ----Block 1: All the useState----
  // General UI & API state
  const [form, setForm] = useState({
    title: "",
    description: "",
    presenter_name: "",
    status: "Draft",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Slides and attendee data
  const [slideErrors, setSlideErrors] = useState({});
  const [attendees, setAttendees] = useState([]);
  const [pollResponses, setPollResponses] = useState([]);
  const [slides, setSlides] = useState([]);
  const [slideModalOpen, setSlideModalOpen] = useState(false);
  const [editingSlideId, setEditingSlideId] = useState(null);
  const [slideForm, setSlideForm] = useState({
    title: "",
    body: "",
    type: "Content",
    question: "",
    options: "",
  });

  // AI summary state
  const [aiSummaries, setAiSummaries] = useState({});
  const [aiLoading, setAiLoading] = useState({});
  const [aiErrors, setAiErrors] = useState({});

  // ----Block 2: Data fetching (All the useEffect)----
  // Fetch presentation data and handle errors
  useEffect(() => {
    apiGet(`/presentations/${id}`)
      .then((data) => setForm(data))
      .catch(() => setLoadError("Could not load this presentation."))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadSlides();
  }, [id]);

  useEffect(() => {
    loadAttendeesAndResponses();
  }, [id]);

  // ----Block 3: Presentation and slide management----
  function validate() {
    const newErrors = {};
    if (!form.title.trim()) newErrors.title = "Title is required";
    if (!form.presenter_name.trim())
      newErrors.presenter_name = "Presenter name is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;

    setSaving(true);
    setSaveMessage(null);
    try {
      await apiPut(`/presentations/${id}`, {
        title: form.title,
        description: form.description,
        presenter_name: form.presenter_name,
        status: form.status,
      });
      setSaveMessage({ type: "success", text: "Saved successfully." });
    } catch {
      setSaveMessage({
        type: "error",
        text: "Failed to save. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: null })); // Clear the error for that field when the user corrects it
  }

  // Slide management
  function loadSlides() {
    apiGet(`/slides?presentation_id=${id}`)
      .then((data) => setSlides(data))
      .catch(() => console.error("Failed to load slides"));
  }

  function openAddSlideModal() {
    setEditingSlideId(null);
    setSlideForm({
      title: "",
      body: "",
      type: "Content",
      question: "",
      options: "",
    });
    setSlideErrors({});
    setSlideModalOpen(true);
  }

  function openEditSlideModal(slide) {
    setEditingSlideId(slide.id);
    setSlideForm({
      title: slide.title,
      body: slide.body,
      type: slide.type,
      question: slide.question || "",
      options: slide.options || "",
    });
    setSlideErrors({});
    setSlideModalOpen(true);
  }

  function validateSlide() {
    const errs = {};
    if (!slideForm.title.trim()) errs.title = "Title is required";
    if (!slideForm.body.trim()) errs.body = "Body is required";
    if (slideForm.type === "Poll") {
      if (!slideForm.question.trim())
        errs.question = "Question is required for Poll";
      if (!slideForm.options.trim())
        errs.options = "Options are required for Poll";
    }
    setSlideErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSaveSlide() {
    if (!validateSlide()) return;

    const payload = {
      presentation_id: id,
      title: slideForm.title,
      body: slideForm.body,
      type: slideForm.type,
      position: editingSlideId
        ? slides.find((s) => s.id === editingSlideId).position
        : slides.length,
      question: slideForm.type === "Poll" ? slideForm.question : "",
      options: slideForm.type === "Poll" ? slideForm.options : "",
    };

    try {
      if (editingSlideId) {
        await apiPut(`/slides/${editingSlideId}`, payload);
      } else {
        await apiPost("/slides", payload);
      }
      setSlideModalOpen(false);
      loadSlides();
    } catch {
      setSlideErrors({ general: "Failed to save slide. Please try again." });
    }
  }

  async function handleDeleteSlide(slideId) {
    if (!confirm("Delete this slide?")) return;
    try {
      await apiDelete(`/slides/${slideId}`);
      loadSlides();
    } catch {
      alert("Failed to delete slide.");
    }
  }

  // Attendee and poll response data
  function loadAttendeesAndResponses() {
    apiGet(`/attendees?presentation_id=${id}`)
      .then(setAttendees)
      .catch(() => console.error("Failed to load attendees"));

    apiGet(`/poll_responses`)
      .then(setPollResponses)
      .catch(() => console.error("Failed to load poll responses"));
  }

  function getPollResultsForSlide(slideId) {
    const validAttendeeIds = new Set(attendees.map((a) => a.id));

    const responsesForThisSlide = pollResponses.filter(
      (r) => r.slide_id === slideId && validAttendeeIds.has(r.attendee_id),
    );

    const counts = {};
    responsesForThisSlide.forEach((r) => {
      counts[r.selected_option] = (counts[r.selected_option] || 0) + 1;
    });

    return { counts, total: responsesForThisSlide.length };
  }

  // Presentation link
  function handleCopyLink() {
    const link = `${window.location.origin}/presentation/${id}`;
    navigator.clipboard.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  // AI summarize handler
  async function handleSummarize(slide) {
    const { counts, total } = getPollResultsForSlide(slide.id);

    if (total === 0) {
      setAiErrors((prev) => ({
        ...prev,
        [slide.id]: "No responses yet to summarize.",
      }));
      return;
    }

    setAiLoading((prev) => ({ ...prev, [slide.id]: true }));
    setAiErrors((prev) => ({ ...prev, [slide.id]: null }));

    try {
      const summary = await summarizePollResults(slide.question, counts, total);
      setAiSummaries((prev) => ({ ...prev, [slide.id]: summary }));
    } catch (err) {
      setAiErrors((prev) => ({ ...prev, [slide.id]: err.message }));
    } finally {
      setAiLoading((prev) => ({ ...prev, [slide.id]: false }));
    }
  }

  if (loading) {
    return (
      <Center h={200}>
        <Loader />
      </Center>
    );
  }

  if (loadError) {
    return (
      <Center h={200}>
        <Text c="red">{loadError}</Text>
      </Center>
    );
  }

  // ----Block 4: Render UI elements----
  return (
    <Box w="100%" px="xl" py="xl" maw={600}>
      <Title order={2} mb="lg">
        Edit Presentation
      </Title>

      {/* Presentation - Presentation details */}
      <TextInput
        label="Title"
        value={form.title}
        onChange={(e) => handleChange("title", e.target.value)}
        error={errors.title}
        mb="md"
        required
      />

      <Textarea
        label="Description"
        value={form.description}
        onChange={(e) => handleChange("description", e.target.value)}
        error={errors.description}
        mb="md"
        minRows={3}
      />

      <TextInput
        label="Presenter Name"
        value={form.presenter_name}
        onChange={(e) => handleChange("presenter_name", e.target.value)}
        error={errors.presenter_name}
        mb="md"
        required
      />

      <Select
        label="Status"
        value={form.status}
        onChange={(value) => handleChange("status", value)}
        data={["Draft", "Published"]}
        mb="lg"
        required
      />

      {saveMessage && (
        <Text c={saveMessage.type === "success" ? "green" : "red"} mb="md">
          {saveMessage.text}
        </Text>
      )}

      <Button onClick={handleSave} loading={saving}>
        Save
      </Button>

      {/* Link & QR code - Presentation link and QR code */}
      <Group mt="xl" mb={50} align="flex-start">
        <Box>
          <Text fw={500} mb="xs">
            Presentation Link
          </Text>
          <Button
            leftSection={<IconCopy size={16} />}
            variant="light"
            onClick={handleCopyLink}
            color={linkCopied ? "teal" : "blue"}
          >
            {linkCopied ? "Copied!" : "Copy Link"}
          </Button>
        </Box>
        <Box>
          <Text fw={500} mb="xs">
            QR Code
          </Text>
          <QRCodeSVG
            value={`${window.location.origin}/presentation/${id}`}
            size={100}
          />
        </Box>
      </Group>

      {/* Slide -  Slide management (Create, edit and delete slide*/}
      <Group justify="space-between" mt={50} mb="md">
        <Title order={3}>Slides</Title>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={openAddSlideModal}
        >
          Add Slide
        </Button>
      </Group>

      {slides.length === 0 && (
        <Text c="dimmed" mb="md">
          No slides yet. Click "Add Slide" to create one.
        </Text>
      )}

      <SimpleGrid cols={2} spacing="md">
        {slides.map((slide) => (
          <Card key={slide.id} withBorder padding="md" radius="md">
            <Group justify="space-between" mb="xs">
              <Text fw={600}>{slide.title}</Text>
              <Text size="xs" c={slide.type === "Poll" ? "orange" : "gray"}>
                {slide.type}
              </Text>
            </Group>
            <Text size="sm" c="dimmed" lineClamp={2} mb="sm">
              {slide.body}
            </Text>
            <Group gap="xs">
              <ActionIcon
                variant="light"
                onClick={() => openEditSlideModal(slide)}
              >
                <IconEdit size={16} />
              </ActionIcon>
              <ActionIcon
                variant="light"
                color="red"
                onClick={() => handleDeleteSlide(slide.id)}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          </Card>
        ))}
      </SimpleGrid>

      {/* Slide (Modal) -  Edit and update slide */}
      <Modal
        opened={slideModalOpen}
        onClose={() => setSlideModalOpen(false)}
        title={editingSlideId ? "Edit Slide" : "Add Slide"}
        size="90%"
      >
        <TextInput
          label="Slide Title"
          value={slideForm.title}
          onChange={(e) =>
            setSlideForm((p) => ({ ...p, title: e.target.value }))
          }
          error={slideErrors.title}
          mb="md"
          required
        />

        <Select
          label="Type"
          value={slideForm.type}
          onChange={(v) => setSlideForm((p) => ({ ...p, type: v }))}
          data={["Content", "Poll"]}
          mb="md"
          required
        />

        {slideForm.type === "Poll" && (
          <>
            <TextInput
              label="Question"
              value={slideForm.question}
              onChange={(e) =>
                setSlideForm((p) => ({ ...p, question: e.target.value }))
              }
              error={slideErrors.question}
              mb="md"
              required
            />
            <TextInput
              label="Options (comma-separated)"
              placeholder="Option A, Option B, Option C"
              value={slideForm.options}
              onChange={(e) =>
                setSlideForm((p) => ({ ...p, options: e.target.value }))
              }
              error={slideErrors.options}
              mb="md"
              required
            />
          </>
        )}

        <Text fw={500} size="sm" mb={4}>
          Body (presentMD)
        </Text>
        <SimpleGrid cols={2} spacing="md">
          <Textarea
            value={slideForm.body}
            onChange={(e) =>
              setSlideForm((p) => ({ ...p, body: e.target.value }))
            }
            error={slideErrors.body}
            autosize
            minRows={20}
            maxRows={30}
          />

          <Box
            p="sm"
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              minHeight: 500,
              maxHeight: 600,
              overflowY: "auto",
            }}
          >
            <PresentMDPreview source={slideForm.body} />

            {slideForm.type === "Poll" && (
              <Box mt="lg" pt="md" style={{ borderTop: "1px solid #ddd" }}>
                <Text fw={600} size="lg" mb="sm">
                  {slideForm.question || "(There is no question)"}
                </Text>
                <Stack gap="xs">
                  {slideForm.options
                    .split(",")
                    .map((opt) => opt.trim())
                    .filter((opt) => opt.length > 0)
                    .map((opt, i) => (
                      <Card key={i} withBorder padding="sm" radius="md">
                        {opt}
                      </Card>
                    ))}
                </Stack>
              </Box>
            )}
          </Box>
        </SimpleGrid>

        {slideErrors.general && (
          <Text c="red" mt="md">
            {slideErrors.general}
          </Text>
        )}

        <Button onClick={handleSaveSlide} mt="lg" fullWidth>
          {editingSlideId ? "Update Slide" : "Create Slide"}
        </Button>
      </Modal>

      {/* Attendees – Track the number of participants and their status (e.g., "Viewing" / "Completed") */}
      <Group justify="space-between" mt={50} mb="md">
        <Title order={3}>Attendees ({attendees.length})</Title>
        <Button
          component={Link}
          to={`/responses/${id}`}
          variant="light"
          size="xs"
        >
          View Details
        </Button>
      </Group>
      {attendees.length === 0 && (
        <Text c="dimmed" mb="xl">
          No one has joined yet. Share the presentation link to get started.
        </Text>
      )}
      <SimpleGrid cols={3} spacing="sm" mb="xl">
        {attendees.map((a) => (
          <Card key={a.id} withBorder padding="sm" radius="md">
            <Group justify="space-between">
              <Text fw={500}>{a.display_name}</Text>
              <Text size="xs" c={a.status === "Finished" ? "green" : "orange"}>
                {a.status}
              </Text>
            </Group>
          </Card>
        ))}
      </SimpleGrid>

      {/* Poll results for each poll slide */}
      {slides.filter((s) => s.type === "Poll").length > 0 && (
        <>
          <Title order={3} mb="md">
            Poll Results
          </Title>
          <Stack gap="lg">
            {slides
              .filter((s) => s.type === "Poll")
              .map((slide) => {
                const { counts, total } = getPollResultsForSlide(slide.id);
                const options = (slide.options || "")
                  .split(",")
                  .map((o) => o.trim())
                  .filter((o) => o.length > 0);

                return (
                  <Card key={slide.id} withBorder padding="md" radius="md">
                    <Text fw={600} mb={4}>
                      {slide.question}
                    </Text>
                    <Text size="sm" c="dimmed" mb="md">
                      {total} response{total !== 1 ? "s" : ""}
                    </Text>

                    <Stack gap="xs">
                      {options.map((opt) => {
                        const count = counts[opt] || 0;
                        const percent =
                          total > 0 ? Math.round((count / total) * 100) : 0;
                        {
                          /* Display poll result counts and percentages */
                        }
                        return (
                          <Box key={opt}>
                            <Group justify="space-between" mb={4}>
                              <Text size="sm">{opt}</Text>
                              <Text size="sm" c="dimmed">
                                {count} ({percent}%)
                              </Text>
                            </Group>
                            <Box
                              style={{
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: "#e9ecef",
                                overflow: "hidden",
                              }}
                            >
                              <Box
                                style={{
                                  height: "100%",
                                  width: `${percent}%`,
                                  backgroundColor: "#228be6",
                                  transition: "width 0.3s",
                                }}
                              />
                            </Box>
                          </Box>
                        );
                      })}
                    </Stack>

                    {/* AI – Displayed as a button below attendee responses (AI summary) */}
                    <Button
                      variant="light"
                      size="xs"
                      mt="md"
                      loading={aiLoading[slide.id]}
                      onClick={() => handleSummarize(slide)}
                    >
                      Summarize with AI
                    </Button>

                    {aiErrors[slide.id] && (
                      <Text size="sm" c="red" mt="xs">
                        {aiErrors[slide.id]}
                      </Text>
                    )}

                    {aiSummaries[slide.id] && (
                      <Text size="sm" mt="xs" fs="italic" c="dimmed">
                        "{aiSummaries[slide.id]}"
                      </Text>
                    )}
                  </Card>
                );
              })}
          </Stack>
        </>
      )}
    </Box>
  );
}
export default HostEdit;
