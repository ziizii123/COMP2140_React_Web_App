import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Box,
  Title,
  Text,
  Card,
  Stack,
  Group,
  Center,
  Loader,
  Badge,
  Button,
} from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { apiGet } from "../api";

/**
 * PollRespones - Displays poll responses grouped by attendee.
 *
 * Fetches the presentation, slides, attendees, and poll responses,
 * then displays each attendee's poll answers.
 *
 * @component
 * @returns {JSX.Element} The poll responses page.
 */

function PollResponses() {
  const { id } = useParams();

  // ----Block 1: All the useState----
  const [presentation, setPresentation] = useState(null);
  const [slides, setSlides] = useState([]);
  const [attendees, setAttendees] = useState([]);
  const [pollResponses, setPollResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // ----Block 2: Data fetching (All the useEffect)----
  // Fetch presentation, slides, attendees, and poll responses
  useEffect(() => {
    Promise.all([
      apiGet(`/presentations/${id}`),
      apiGet(`/slides?presentation_id=${id}&sort=position`),
      apiGet(`/attendees?presentation_id=${id}`),
      apiGet(`/poll_responses`),
    ])
      .then(([presentationData, slidesData, attendeesData, responsesData]) => {
        setPresentation(presentationData);
        setSlides(slidesData);
        setAttendees(attendeesData);
        setPollResponses(responsesData);
      })
      .catch(() =>
        setLoadError("Could not load responses for this presentation."),
      )
      .finally(() => setLoading(false));
  }, [id]);

  // ----Block 3: Helper Functions / Data Processing----
  function getAnswersForAttendee(attendeeId) {
    // Filter responses by attendee and slides belonging to the current presentation
    const slideIds = new Set(slides.map((s) => s.id));
    return pollResponses.filter(
      (r) => r.attendee_id === attendeeId && slideIds.has(r.slide_id),
    );
  }

  function getSlideQuestion(slideId) {
    const slide = slides.find((s) => s.id === slideId);
    return slide ? slide.question : "(deleted slide)";
  }

  if (loading) {
    return (
      <Center h={300}>
        <Loader />
      </Center>
    );
  }

  if (loadError) {
    return (
      <Center h={300}>
        <Text c="red">{loadError}</Text>
      </Center>
    );
  }

  const pollSlides = slides.filter((s) => s.type === "Poll");

  // ----Block 4: UI render----
  return (
    <Box w="100%" px="xl" py="xl">
      <Button
        component={Link}
        to={`/edit/${id}`}
        leftSection={<IconArrowLeft size={16} />}
        variant="subtle"
        mb="lg"
      >
        Back to Edit
      </Button>

      <Title order={2} mb={4}>
        {presentation.title}
      </Title>
      <Text c="dimmed" mb="xl">
        {attendees.length} attendee{attendees.length !== 1 ? "s" : ""} ·{" "}
        {pollSlides.length} poll slide{pollSlides.length !== 1 ? "s" : ""}
      </Text>

      {attendees.length === 0 && (
        <Text c="dimmed">No attendees have joined yet.</Text>
      )}

      <Stack gap="md">
        {attendees.map((attendee) => {
          const answers = getAnswersForAttendee(attendee.id);

          return (
            <Card key={attendee.id} withBorder padding="md" radius="md">
              <Group justify="space-between" mb="sm">
                <Text fw={600}>{attendee.display_name}</Text>
                <Badge
                  color={attendee.status === "Finished" ? "green" : "orange"}
                >
                  {attendee.status}
                </Badge>
              </Group>

              {pollSlides.length === 0 && (
                <Text size="sm" c="dimmed">
                  This presentation has no poll slides.
                </Text>
              )}

              {answers.length === 0 && pollSlides.length > 0 && (
                <Text size="sm" c="dimmed">
                  No poll answers yet.
                </Text>
              )}

              <Stack gap={4}>
                {answers.map((r) => (
                  <Group key={r.id} justify="space-between">
                    <Text size="sm" c="dimmed">
                      {getSlideQuestion(r.slide_id)}
                    </Text>
                    <Text size="sm" fw={500}>
                      {r.selected_option}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
}

export default PollResponses;
