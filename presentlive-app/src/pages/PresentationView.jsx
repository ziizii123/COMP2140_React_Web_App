// src/pages/PresentationView.jsx
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  Box,
  Title,
  Text,
  TextInput,
  Button,
  Center,
  Loader,
  Stack,
  Group,
} from "@mantine/core";
import { apiGet, apiPost, apiPut } from "../api";
import { PresentMDPreview } from "../presentMDRenderer";

function PresentationView() {
  const { id } = useParams();

  // ===== KHỐI 1: state =====
  const [presentation, setPresentation] = useState(null);
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [phase, setPhase] = useState("welcome"); // "welcome" | "slides" | "finished"
  const [displayName, setDisplayName] = useState("");
  const [nameError, setNameError] = useState(null);
  const [joining, setJoining] = useState(false);

  const [attendee, setAttendee] = useState(null); // record Attendee sau khi join
  const [currentPosition, setCurrentPosition] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [pollSubmitted, setPollSubmitted] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(null); // null = chưa bật review

  // ===== KHỐI 2: useEffect =====
  useEffect(() => {
    Promise.all([
      apiGet(`/presentations/${id}`),
      apiGet(`/slides?presentation_id=${id}&sort=position`),
    ])
      .then(([presentationData, slidesData]) => {
        setPresentation(presentationData);
        setSlides(slidesData);
        checkExistingAttendee();
      })
      .catch(() => setLoadError("This presentation could not be found."))
      .finally(() => setLoading(false));
  }, [id]);

  // ===== KHỐI 3: hàm xử lý =====
  function checkExistingAttendee() {
    const savedAttendeeId = localStorage.getItem(`attendee_${id}`);
    if (!savedAttendeeId) return;

    apiGet(`/attendees/${savedAttendeeId}`)
      .then((data) => {
        setAttendee(data);
        setCurrentPosition(data.current_position);
        setPhase(data.status === "Finished" ? "finished" : "slides");
      })
      .catch(() => {
        // attendeeId cũ không còn hợp lệ (VD: bị xóa) -> coi như người mới
        localStorage.removeItem(`attendee_${id}`);
      });
  }

  async function handleJoin() {
    if (!displayName.trim()) {
      setNameError("Please enter your name");
      return;
    }

    setJoining(true);
    try {
      const newAttendee = await apiPost("/attendees", {
        presentation_id: id,
        display_name: displayName,
        status: "Viewing",
        current_position: 0,
      });
      localStorage.setItem(`attendee_${id}`, newAttendee.id);
      setAttendee(newAttendee);
      setCurrentPosition(0);
      setPhase("slides");
    } catch {
      setNameError("Could not join. Please try again.");
    } finally {
      setJoining(false);
    }
  }

  async function handleNext() {
    setAdvancing(true);
    const nextPosition = currentPosition + 1;

    try {
      if (nextPosition >= slides.length) {
        // Đã qua slide cuối -> kết thúc
        await apiPut(`/attendees/${attendee.id}`, {
          presentation_id: attendee.presentation_id,
          display_name: attendee.display_name,
          status: "Finished",
          current_position: currentPosition,
        });
        setPhase("finished");
      } else {
        await apiPut(`/attendees/${attendee.id}`, {
          presentation_id: attendee.presentation_id,
          display_name: attendee.display_name,
          status: "Viewing",
          current_position: nextPosition,
        });
        setCurrentPosition(nextPosition);
        setSelectedOption(null);
        setPollSubmitted(false);
      }
    } catch {
      alert("Could not advance. Please try again.");
    } finally {
      setAdvancing(false);
    }
  }

  async function handleSubmitPoll(slideId) {
    if (!selectedOption) return;

    try {
      await apiPost("/poll_responses", {
        attendee_id: attendee.id,
        slide_id: slideId,
        selected_option: selectedOption,
      });
      setPollSubmitted(true);
    } catch {
      alert("Could not submit your answer. Please try again.");
    }
  }

  // ===== KHỐI 4-5: early return =====
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

  if (presentation.status !== "Published") {
    return (
      <Center h={300}>
        <Text c="dimmed">This presentation is not published yet.</Text>
      </Center>
    );
  }

  // ===== KHỐI 6: JSX =====
  if (phase === "welcome") {
    return (
      <Center h="100vh">
        <Box maw={400} w="100%" p="xl">
          <Title order={2} mb="xs">
            {presentation.title}
          </Title>
          <Text c="dimmed" mb="lg">
            {presentation.description}
          </Text>
          <Text size="sm" mb={4}>
            Presented by {presentation.presenter_name}
          </Text>

          <TextInput
            label="Your name"
            placeholder="Enter your display name"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setNameError(null);
            }}
            error={nameError}
            mt="lg"
            mb="md"
            required
          />

          <Button onClick={handleJoin} loading={joining} fullWidth>
            Join Presentation
          </Button>
        </Box>
      </Center>
    );
  }

  // Tạm thời placeholder cho phase "slides" và "finished" — làm ở Bước 2, 3
  // ===== phase === "slides" =====
  if (phase === "slides") {
    const slide = slides[currentPosition];
    const options = (slide.options || "")
      .split(",")
      .map((o) => o.trim())
      .filter((o) => o.length > 0);

    return (
      <Center h="100vh">
        <Box maw={700} w="100%" p="xl">
          <Text size="sm" c="dimmed" mb="md">
            Slide {currentPosition + 1} of {slides.length}
          </Text>

          <Box mb="xl">
            <PresentMDPreview source={slide.body} />
          </Box>

          {slide.type === "Poll" && (
            <Box mt="xl" pt="lg" style={{ borderTop: "1px solid #ddd" }}>
              <Text fw={600} size="lg" mb="md">
                {slide.question}
              </Text>

              {pollSubmitted ? (
                <Text c="green">
                  Your answer has been recorded: {selectedOption}
                </Text>
              ) : (
                <Stack gap="xs" mb="md">
                  {options.map((opt) => (
                    <Button
                      key={opt}
                      variant={selectedOption === opt ? "filled" : "light"}
                      onClick={() => setSelectedOption(opt)}
                      fullWidth
                    >
                      {opt}
                    </Button>
                  ))}
                </Stack>
              )}

              {!pollSubmitted && (
                <Button
                  onClick={() => handleSubmitPoll(slide.id)}
                  disabled={!selectedOption}
                  fullWidth
                  mb="md"
                >
                  Submit Answer
                </Button>
              )}
            </Box>
          )}

          <Button
            onClick={handleNext}
            loading={advancing}
            disabled={slide.type === "Poll" && !pollSubmitted}
            fullWidth
            mt="xl"
          >
            {currentPosition + 1 >= slides.length ? "Finish" : "Next"}
          </Button>
        </Box>
      </Center>
    );
  }

  // Tạm thời placeholder cho phase "finished" — làm ở Bước 3
  // ===== phase === "finished" =====
  if (phase === "finished") {
    // Đang ở chế độ Review: xem lại từng slide, chỉ đọc, không ảnh hưởng tiến trình
    if (reviewIndex !== null) {
      const slide = slides[reviewIndex];
      const options = (slide.options || "")
        .split(",")
        .map((o) => o.trim())
        .filter((o) => o.length > 0);

      return (
        <Center h="100vh">
          <Box maw={700} w="100%" p="xl">
            <Text size="sm" c="dimmed" mb="md">
              Reviewing slide {reviewIndex + 1} of {slides.length}
            </Text>

            <Box mb="xl">
              <PresentMDPreview source={slide.body} />
            </Box>

            {slide.type === "Poll" && (
              <Box mt="xl" pt="lg" style={{ borderTop: "1px solid #ddd" }}>
                <Text fw={600} size="lg" mb="md">
                  {slide.question}
                </Text>
                <Stack gap="xs">
                  {options.map((opt) => (
                    <Button key={opt} variant="light" disabled fullWidth>
                      {opt}
                    </Button>
                  ))}
                </Stack>
                <Text size="sm" c="dimmed" mt="xs">
                  (Read-only — you already answered this during the
                  presentation)
                </Text>
              </Box>
            )}

            <Group mt="xl" justify="space-between">
              <Button
                variant="default"
                disabled={reviewIndex === 0}
                onClick={() => setReviewIndex((i) => i - 1)}
              >
                Previous
              </Button>

              {reviewIndex + 1 < slides.length ? (
                <Button onClick={() => setReviewIndex((i) => i + 1)}>
                  Next
                </Button>
              ) : (
                <Button variant="light" onClick={() => setReviewIndex(null)}>
                  Back to summary
                </Button>
              )}
            </Group>
          </Box>
        </Center>
      );
    }

    // Màn hình Thank you mặc định
    return (
      <Center h="100vh">
        <Box maw={500} w="100%" p="xl" style={{ textAlign: "center" }}>
          <Title order={2} mb="md">
            Thank you!
          </Title>
          <Text c="dimmed" mb="xl">
            You've completed "{presentation.title}". Your responses have been
            recorded.
          </Text>

          {slides.length > 0 && (
            <Button variant="light" onClick={() => setReviewIndex(0)}>
              Review Slides
            </Button>
          )}
        </Box>
      </Center>
    );
  }
}

export default PresentationView;
